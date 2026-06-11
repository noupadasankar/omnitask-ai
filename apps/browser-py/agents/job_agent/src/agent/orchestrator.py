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
    
    def __init__(self, config_path: str = "config/preferences.yaml"):
        """Initialize the orchestrator.
        
        Args:
            config_path: Path to user preferences config file
        """
        self.logger = get_logger("JobAgent")
        self.logger.info("🚀 Initializing Job Agent...")
        
        # Load configurations
        self.user_preferences = load_config(config_path)
        self.portals_config = load_portals_config()
        self.env = load_env()
        
        # Initialize components
        self.db = DatabaseTracker()
        self.llm = get_llm_client(self.env.get('llm_model', 'claude-sonnet-4.5'))
        
        # Load resume
        resume_file = find_resume_file()
        if not resume_file:
            raise FileNotFoundError(
                "No resume file found in config/ directory. "
                "Please add your resume as 'resume.pdf' or 'resume.docx'"
            )
        
        self.resume_parser = ResumeParser(resume_file)
        self.resume_data = self.resume_parser.parsed_data
        
        self.logger.info(f"📄 Resume loaded: {resume_file}")
        self.logger.info(f"👤 User: {self.user_preferences['user_profile']['name']}")
        
        # Browser will be initialized in run()
        self.browser: Optional[PlaywrightClient] = None
        
        # Track results
        self.results = {
            'total_applications': 0,
            'by_portal': {},
            'start_time': None,
            'end_time': None
        }
    
    async def run(self):
        """Run the job application agent."""
        try:
            self.results['start_time'] = datetime.now()
            
            # Initialize browser
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
            dry_run = self.env.get('dry_run', False)
            
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
        
        return portal_class(
            browser=self.browser,
            db=self.db,
            llm=self.llm,
            logger=self.logger,
            config=portal_config,
            user_preferences=self.user_preferences,
            resume_data=self.resume_data
        )
    
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
