"""
Base Portal Class
Abstract base class for all job portal implementations.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any
import asyncio
from src.browser.playwright_client import PlaywrightClient
from src.database.tracker import DatabaseTracker
from src.agent.llm_client import LLMClient
from src.utils.logger import AgentLogger


class BasePortal(ABC):
    """Abstract base class for job portal scrapers."""
    
    def __init__(self,
                 browser: PlaywrightClient,
                 db: DatabaseTracker,
                 llm: LLMClient,
                 logger: AgentLogger,
                 config: Dict,
                 user_preferences: Dict,
                 resume_data: Dict):
        """Initialize portal.
        
        Args:
            browser: Playwright browser client
            db: Database tracker
            llm: LLM client for decision making
            logger: Logger instance
            config: Portal-specific configuration
            user_preferences: User's job preferences
            resume_data: Parsed resume data
        """
        self.browser = browser
        self.db = db
        self.llm = llm
        self.logger = logger
        self.config = config
        self.user_preferences = user_preferences
        self.resume_data = resume_data
        
        self.portal_name = config.get('name', 'Unknown')
        self.base_url = config.get('url', '')
        self.login_url = config.get('login_url', '')
        self.search_url = config.get('search_url', '')
        self.selectors = config.get('selectors', {})
        self.wait_time = config.get('wait_time', 2)
        self.max_scroll = config.get('max_scroll', 3)
        
        self.applications_count = 0
    
    @abstractmethod
    async def login(self) -> bool:
        """Login to the portal (if session not restored).
        
        Returns:
            True if login successful
        """
        pass
    
    @abstractmethod
    async def search_jobs(self) -> List[Dict]:
        """Search for jobs based on user preferences.
        
        Returns:
            List of job dictionaries
        """
        pass
    
    @abstractmethod
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a specific job.
        
        Args:
            job: Job dictionary with details
        
        Returns:
            True if application successful
        """
        pass
    
    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """Main processing method for the portal.
        
        Args:
            max_applications: Maximum applications to submit
            dry_run: If True, don't actually submit applications
        
        Returns:
            Number of applications submitted
        """
        self.logger.portal_start(self.portal_name)
        
        # Check if already hit daily limit
        today_count = self.db.get_applications_today(self.portal_name)
        if today_count >= max_applications:
            self.logger.info(f"Already hit limit for {self.portal_name} today: {today_count}")
            return 0
        
        remaining = max_applications - today_count
        
        # Try to restore session
        session_restored = await self.restore_session()
        
        # Login if session not restored
        if not session_restored:
            self.logger.session_new(self.portal_name)
            login_success = await self.login()
            if not login_success:
                self.logger.error(f"Login failed for {self.portal_name}")
                return 0
            
            # Save session after successful login
            await self.save_session()
        else:
            self.logger.session_restored(self.portal_name)
        
        # Search for jobs
        jobs = await self.search_jobs()
        self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")
        
        # Process each job
        for job in jobs:
            if self.applications_count >= remaining:
                self.logger.info(f"Reached application limit for {self.portal_name}")
                break
            
            try:
                # Check if already applied
                if self.db.is_already_applied(job['job_url']):
                    self.logger.job_skipped(f"Already applied: {job['role']}")
                    continue
                
                # Analyze job match
                match_result = self.llm.analyze_job_match(
                    job.get('description', ''),
                    job.get('role', ''),
                    job.get('company', ''),
                    self.user_preferences,
                    self.resume_data
                )
                
                job['match_score'] = match_result['match_score']
                
                # Log detailed matching result for debugging
                self.logger.info(f"📋 Evaluating: {job['role']} at {job['company']}")
                self.logger.info(f"   Score: {match_result['match_score']}/100")
                self.logger.debug(f"   Reasoning:\n{match_result['reasoning']}")
                
                if not match_result['should_apply']:
                    self.logger.job_skipped(
                        f"{job['role']} at {job['company']} - Score: {match_result['match_score']}"
                    )
                    self.logger.debug(f"   Rejected because: {match_result['reasoning']}")
                    continue
                
                self.logger.job_found(self.portal_name, job['company'], job['role'])
                self.logger.debug(f"Match reasoning:\n{match_result['reasoning']}")
                
                # Apply to job
                if not dry_run:
                    success = await self.apply_to_job(job)
                    
                    if success:
                        # Save to database
                        self.db.add_application(
                            portal=self.portal_name,
                            company=job['company'],
                            role=job['role'],
                            job_url=job['job_url'],
                            job_id=job.get('job_id'),
                            job_description=job.get('description'),
                            location=job.get('location'),
                            salary=job.get('salary'),
                            match_score=job['match_score'],
                            application_method='automated'
                        )
                        
                        self.logger.job_applied(self.portal_name, job['company'], job['role'])
                        self.applications_count += 1
                        
                        # Wait between applications
                        await asyncio.sleep(self.wait_time)
                else:
                    self.logger.info(f"[DRY RUN] Would apply to: {job['role']} at {job['company']}")
                    self.applications_count += 1
                
            except Exception as e:
                self.logger.error(f"Error processing job {job.get('role', 'Unknown')}: {e}", exc_info=True)
                self.db.log_portal_event(
                    self.portal_name,
                    'ERROR',
                    f"Error processing job: {job.get('role', 'Unknown')}",
                    str(e)
                )
                continue
        
        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count
    
    async def restore_session(self) -> bool:
        """Try to restore saved session.
        
        Returns:
            True if session restored successfully
        """
        try:
            session_data = self.db.get_session(self.portal_name)
            if session_data:
                # Load cookies
                success = await self.browser.load_cookies(self.portal_name)
                if success:
                    # Verify session is still valid
                    await self.browser.goto(self.base_url)
                    await asyncio.sleep(2)
                    
                    # Check if logged in (portal-specific logic in subclass)
                    is_logged_in = await self.verify_login()
                    if is_logged_in:
                        return True
                    else:
                        self.db.invalidate_session(self.portal_name)
        except Exception as e:
            self.logger.debug(f"Error restoring session: {e}")
        
        return False
    
    async def save_session(self):
        """Save current session."""
        try:
            await self.browser.save_cookies(self.portal_name)
            # Also save to database
            cookies = await self.browser.context.cookies()
            self.db.save_session(self.portal_name, cookies)
        except Exception as e:
            self.logger.error(f"Error saving session: {e}")
    
    @abstractmethod
    async def verify_login(self) -> bool:
        """Verify if currently logged in.
        
        Returns:
            True if logged in
        """
        pass
    
    async def wait_for_manual_action(self, message: str, timeout: int = 120):
        """Wait for user to complete manual action (like CAPTCHA).
        
        Args:
            message: Message to display
            timeout: Maximum time to wait in seconds
        """
        self.logger.warning(message)
        self.logger.warning(f"Waiting up to {timeout} seconds for manual action...")
        await asyncio.sleep(timeout)
    
    def get_applications_count(self) -> int:
        """Get number of applications made in this session.
        
        Returns:
            Application count
        """
        return self.applications_count
