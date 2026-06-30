"""
Job Agent Orchestrator
Main orchestration logic for the autonomous job application agent.
"""

import asyncio
from typing import Dict, List, Optional
from datetime import datetime

from src.browser.playwright_client import PlaywrightClient
from src.database.tracker import DatabaseTracker
from src.agent.llm_client import LLMClient, get_llm_client
from src.resume.parser import ResumeParser, find_resume_file
from src.utils.config_loader import load_config, load_portals_config, load_env
from src.utils.logger import get_logger, AgentLogger
from src.portals.naukri import NaukriPortal
from src.portals.instahyre import InstahyrePortal
from src.portals.hirist import HiristPortal
from src.portals.cutshort import CutshortPortal
from src.portals.linkedin import LinkedInPortal


class JobAgentOrchestrator:
    """Orchestrates the entire job application process across multiple portals."""
    
    def __init__(self, config_path: str = "config/preferences.yaml",
                 bridge: Optional[object] = None,
                 preferences_override: Optional[Dict] = None):
        """Initialize the orchestrator.

        Args:
            config_path: Path to user preferences config file
            bridge: Optional OmniTask integration bridge. When provided, the
                agent runs as a skill inside the OmniTask browser engine: it
                streams per-job application results and gates each submit through
                the dashboard's approval panel instead of running headless/CLI.
            preferences_override: Optional dict merged onto the YAML preferences
                (roles/locations/keywords/limits/portals from the dashboard).
        """
        self.logger = get_logger("JobAgent")
        self.logger.info("🚀 Initializing Job Agent...")

        # Load configurations
        self.user_preferences = load_config(config_path)
        if preferences_override:
            self._apply_preferences_override(preferences_override)
        self.portals_config = load_portals_config()
        self.env = load_env()

        # OmniTask integration bridge (None in standalone CLI mode).
        self.bridge = bridge
        
        # Initialize components
        self.db = DatabaseTracker()
        self.llm = get_llm_client(self.env.get('llm_model', 'claude-sonnet-4.5'))

        # Cognitive engine — a FULLY LOCAL reasoning loop (no API key, no cloud).
        # Runs on-device models via Ollama. When the local server is reachable,
        # portals delegate form completion to it; otherwise they fall back to the
        # rule-based flow. Availability is probed at apply time (needs awaiting).
        try:
            from src.cognition.engine import LocalEngine
            self.cognition = LocalEngine()
            self.logger.info(
                f"🧠 Local cognitive engine ready (Ollama {self.cognition.host}, "
                f"reasoning model: {self.cognition.model}). No API key required — "
                f"availability is checked when the first application starts."
            )
        except Exception as exc:  # noqa: BLE001
            self.logger.warning(f"Local cognitive engine unavailable: {exc}")
            self.cognition = None
        
        # Load resume
        resume_file = find_resume_file()
        if not resume_file:
            raise FileNotFoundError(
                "No resume file found in config/ directory. "
                "Please add your resume as 'resume.pdf' or 'resume.docx'"
            )
        
        self.resume_parser = ResumeParser(resume_file)
        self.resume_data = self.resume_parser.parsed_data

        # Populate user_profile from parsed resume so portals use the
        # uploaded file's contact info rather than any yaml defaults.
        profile = self.user_preferences.setdefault('user_profile', {})
        if not profile.get('name') and self.resume_data.get('name'):
            profile['name'] = self.resume_data['name']
        if not profile.get('first_name') and self.resume_data.get('first_name'):
            profile['first_name'] = self.resume_data['first_name']
        if not profile.get('last_name') and self.resume_data.get('last_name'):
            profile['last_name'] = self.resume_data['last_name']
        if not profile.get('email') and self.resume_data.get('email'):
            profile['email'] = self.resume_data['email']
        if not profile.get('phone') and self.resume_data.get('phone'):
            profile['phone'] = self.resume_data['phone']
        if not profile.get('current_location') and self.resume_data.get('location'):
            profile['current_location'] = self.resume_data['location']

        display_name = profile.get('name') or self.resume_data.get('email') or 'User'
        self.logger.info(f"📄 Resume loaded: {resume_file}")
        self.logger.info(f"👤 User: {display_name}")
        
        # Browser will be initialized in run()
        self.browser: Optional[PlaywrightClient] = None
        
        # Track results
        self.results = {
            'total_applications': 0,
            'by_portal': {},
            'start_time': None,
            'end_time': None
        }
    
    async def run(self, page=None, context=None, dry_run=None):
        """Run the job application agent.

        Args:
            page: Optional Playwright Page to drive (injected by the OmniTask
                engine). When given, the agent reuses this live page instead of
                launching its own browser, so the dashboard live view works.
            context: The BrowserContext that owns `page` (for cookies/session).
            dry_run: Override the env DRY_RUN flag (the dashboard defaults this
                to True so a run can be watched without a real submit).
        """
        injected = page is not None
        try:
            self.results['start_time'] = datetime.now()

            # Initialize browser — or adopt the engine's live page when injected.
            if injected:
                self.logger.info("🌐 Using OmniTask live browser page")
                self.browser = PlaywrightClient.from_page(page, context)
            else:
                self.logger.info("🌐 Starting browser...")
                self.browser = PlaywrightClient(
                    headless=self.env.get('headless', False),
                    slow_mo=self.env.get('browser_slow_mo', 500)
                )
                await self.browser.start()

            # Get enabled portals
            enabled_portals = self.user_preferences.get('portals', {}).get('enabled', [])
            portal_priority = self.user_preferences.get('portals', {}).get('priority', enabled_portals)

            # Calculate application limits (check both filters and preferences for compatibility)
            filters = self.user_preferences.get('filters', {})
            prefs = self.user_preferences.get('preferences', {})
            max_per_day = filters.get('max_applications_per_day') or prefs.get('max_applications_per_day', 50)
            max_per_portal = filters.get('max_applications_per_portal') or prefs.get('max_applications_per_portal', 10)
            dry_run = self.env.get('dry_run', False) if dry_run is None else dry_run
            
            if dry_run:
                self.logger.warning("🧪 DRY RUN MODE - No applications will be submitted")
            
            # Check today's total
            total_today = self.db.get_applications_today()
            if total_today >= max_per_day:
                self.logger.info(f"✋ Daily limit reached: {total_today}/{max_per_day}")
                return
            
            remaining_today = max_per_day - total_today
            self.logger.info(f"📊 Applications today: {total_today}/{max_per_day}")
            self.logger.info(f"🎯 Remaining applications: {remaining_today}")
            
            # Process each enabled portal
            for portal_name in portal_priority:
                if portal_name not in enabled_portals:
                    continue

                # Stop requested from the dashboard — halt before the next portal.
                if self.bridge is not None and await self.bridge.cancelled():
                    self.logger.warning("🛑 Stop requested — halting run")
                    break

                # Check if we still have applications remaining
                if self.results['total_applications'] >= remaining_today:
                    self.logger.info("✋ Daily limit reached")
                    break
                
                # Get portal configuration
                portal_config = self.portals_config.get(portal_name)
                if not portal_config or not portal_config.get('enabled', False):
                    self.logger.info(f"⏭️  Skipping disabled portal: {portal_name}")
                    continue
                
                try:
                    # Initialize portal
                    portal = self._create_portal(portal_name, portal_config)
                    if not portal:
                        self.logger.warning(f"⚠️ Portal not implemented: {portal_name}")
                        continue
                    
                    # Calculate remaining applications for this portal
                    portal_limit = min(max_per_portal, remaining_today - self.results['total_applications'])
                    
                    # Process portal
                    applications = await portal.process(
                        max_applications=portal_limit,
                        dry_run=dry_run
                    )
                    
                    # Update results
                    self.results['by_portal'][portal_name] = applications
                    self.results['total_applications'] += applications
                    
                    self.logger.info(f"✅ {portal_name}: {applications} applications")
                    
                    # Wait between portals
                    if self.results['total_applications'] < remaining_today:
                        await asyncio.sleep(5)
                    
                except Exception as e:
                    self.logger.error(f"Error processing {portal_name}: {e}", exc_info=True)
                    self.db.log_portal_event(portal_name, 'ERROR', 'Portal processing failed', str(e))
                    continue
            
            # Generate report
            self._generate_report()
            
        except Exception as e:
            self.logger.error(f"Fatal error in agent: {e}", exc_info=True)
            raise
        
        finally:
            # Cleanup
            if self.browser:
                await self.browser.close()
            
            self.results['end_time'] = datetime.now()
            
            self.logger.info("👋 Agent execution completed")
    
    def _create_portal(self, portal_name: str, portal_config: Dict):
        """Create a portal instance based on name.
        
        Args:
            portal_name: Name of the portal
            portal_config: Portal configuration
        
        Returns:
            Portal instance or None
        """
        portal_map = {
            'naukri': NaukriPortal,
            'instahyre': InstahyrePortal,
            'hirist': HiristPortal,
            'cutshort': CutshortPortal,
            'linkedin': LinkedInPortal,
            # Add more portals here
        }
        
        portal_class = portal_map.get(portal_name.lower())
        if not portal_class:
            return None

        portal = portal_class(
            browser=self.browser,
            db=self.db,
            llm=self.llm,
            logger=self.logger,
            config=portal_config,
            user_preferences=self.user_preferences,
            resume_data=self.resume_data
        )
        # Hand the OmniTask bridge to the portal so it streams results + gates
        # each submit through the dashboard (None → original standalone flow).
        portal.bridge = self.bridge
        # Hand the cognitive engine to the portal (None → rule-based only).
        portal.cognition = getattr(self, 'cognition', None)
        return portal

    def _apply_preferences_override(self, override: Dict) -> None:
        """Merge dashboard-provided preferences onto the YAML config.

        Maps the flat JobPreference shape (roles/locations/keywords/limits/
        portals) onto the nested structure the rule-based matcher reads
        (`preferences.*` + `filters.*` + `portals.*`).
        """
        prefs = self.user_preferences.setdefault('preferences', {})
        filters = self.user_preferences.setdefault('filters', {})
        portals = self.user_preferences.setdefault('portals', {})

        if override.get('roles'):
            prefs['roles'] = override['roles']
        if override.get('locations'):
            prefs['locations'] = override['locations']
        if override.get('requiredKeywords') is not None:
            filters['required_keywords'] = override['requiredKeywords']
        if override.get('preferredKeywords') is not None:
            filters['preferred_keywords'] = override['preferredKeywords']
        if override.get('excludeKeywords') is not None:
            filters['exclude_keywords'] = override['excludeKeywords']
        if override.get('minScore') is not None:
            filters['min_match_score'] = override['minScore']
        if override.get('maxApplications') is not None:
            filters['max_applications_per_day'] = override['maxApplications']
            filters['max_applications_per_portal'] = override['maxApplications']
        if override.get('portals'):
            portals['enabled'] = override['portals']
            portals['priority'] = override['portals']

        # User profile (name/email/phone from the wizard)
        if override.get('userProfile'):
            up = override['userProfile']
            profile = self.user_preferences.setdefault('user_profile', {})
            for key in ('name', 'email', 'phone'):
                if up.get(key):
                    profile[key] = up[key]

        # Portal credentials (auto-login in each portal's login() method)
        if override.get('credentials'):
            self.user_preferences['credentials'] = override['credentials']
    
    def _generate_report(self):
        """Generate and display execution report."""
        self.logger.info("\n" + "="*60)
        self.logger.info("📊 JOB APPLICATION SUMMARY")
        self.logger.info("="*60)
        
        self.logger.info(f"🎯 Total Applications: {self.results['total_applications']}")
        
        if self.results['by_portal']:
            self.logger.info("\n📌 By Portal:")
            for portal, count in self.results['by_portal'].items():
                self.logger.info(f"   • {portal}: {count}")
        
        # Get recent applications
        recent = self.db.get_recent_applications(limit=10)
        if recent:
            self.logger.info("\n📝 Recent Applications:")
            for app in recent[:5]:
                self.logger.info(f"   • {app['role']} at {app['company']} ({app['portal']})")
        
        # Get overall stats
        stats = self.db.get_application_stats()
        self.logger.info(f"\n📈 Overall Stats:")
        self.logger.info(f"   • Total Applications Ever: {stats['total_applications']}")
        if stats.get('avg_match_score'):
            self.logger.info(f"   • Average Match Score: {stats['avg_match_score']}")
        
        # Duration
        if self.results['start_time'] and self.results['end_time']:
            duration = self.results['end_time'] - self.results['start_time']
            self.logger.info(f"\n⏱️  Duration: {duration.seconds // 60} minutes {duration.seconds % 60} seconds")
        
        self.logger.info("="*60 + "\n")
    
    def close(self):
        """Close database connection."""
        self.db.close()


async def main():
    """Main entry point for the agent."""
    orchestrator = JobAgentOrchestrator()
    try:
        await orchestrator.run()
    finally:
        orchestrator.close()


if __name__ == "__main__":
    asyncio.run(main())
