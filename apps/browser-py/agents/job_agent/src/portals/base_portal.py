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

        # OmniTask integration bridge. None → standalone CLI behavior (unchanged).
        # When set (by the orchestrator), every candidate is streamed to the
        # dashboard and each submit is gated by approve-before-submit.
        self.bridge = None
    
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
    
    async def _prepare_portal(self, max_applications: int) -> bool:
        """Shared portal startup: daily-limit guard + session restore / login.

        Returns False when the portal should be skipped (limit already hit or
        login failed), True when it's ready to search and apply.
        """
        self.logger.portal_start(self.portal_name)

        today_count = self.db.get_applications_today(self.portal_name)
        if today_count >= max_applications:
            self.logger.info(f"Already hit limit for {self.portal_name} today: {today_count}")
            return False

        if await self.restore_session():
            self.logger.session_restored(self.portal_name)
            return True

        self.logger.session_new(self.portal_name)
        if not await self.login():
            self.logger.error(f"Login failed for {self.portal_name}")
            return False
        await self.save_session()
        return True

    async def _evaluate_and_apply(self, job: Dict, dry_run: bool) -> bool:
        """Score one job, then apply — gated through the dashboard when bridged,
        or directly in standalone CLI mode.

        Returns True when the job counts toward the limit (a real submit, or a
        dry-run / approved candidate); False when skipped, denied, or failed.
        """
        match_result = self.llm.analyze_job_match(
            job.get('description', ''),
            job.get('role', ''),
            job.get('company', ''),
            self.user_preferences,
            self.resume_data,
        )
        job['match_score'] = match_result['match_score']

        self.logger.info(f"📋 Evaluating: {job['role']} at {job.get('company', '')}")
        self.logger.info(f"   Score: {match_result['match_score']}/100")

        if not match_result['should_apply']:
            self.logger.job_skipped(f"{job['role']} - Score: {match_result['match_score']}")
            if self.bridge is not None:
                await self.bridge.emit_application(
                    self._app_record(job, match_result, 'SKIPPED')
                )
            return False

        self.logger.job_found(self.portal_name, job.get('company', ''), job['role'])

        # OmniTask path: stream the candidate + gate the submit through approval.
        if self.bridge is not None:
            return await self._bridged_apply(job, match_result, dry_run)

        # Standalone CLI path.
        if dry_run:
            self.logger.info(f"[DRY RUN] Would apply to: {job['role']}")
            return True

        success = await self.apply_to_job(job)
        if not success:
            return False

        self.db.add_application(
            portal=self.portal_name,
            company=job.get('company', ''),
            role=job['role'],
            job_url=job['job_url'],
            job_id=job.get('job_id'),
            job_description=job.get('description'),
            location=job.get('location'),
            salary=job.get('salary'),
            match_score=job['match_score'],
            application_method='automated',
        )
        self.logger.job_applied(self.portal_name, job.get('company', ''), job['role'])
        await asyncio.sleep(self.wait_time)
        return True

    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """Default flow for portals that list every job up-front with real
        per-job URLs: search once, then evaluate/apply each in order.

        Portals whose listing reloads after each apply (single-page Easy-Apply /
        checkbox flows) override this with `_process_single_page`.

        Args:
            max_applications: Maximum applications to submit
            dry_run: If True, run the full flow but don't actually submit

        Returns:
            Number of applications submitted
        """
        if not await self._prepare_portal(max_applications):
            return self.applications_count

        remaining = max_applications - self.db.get_applications_today(self.portal_name)

        jobs = await self.search_jobs()
        self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")

        for job in jobs:
            if self.applications_count >= remaining:
                self.logger.info(f"Reached application limit for {self.portal_name}")
                break

            # Honor a user stop request between candidates.
            if self.bridge is not None and await self.bridge.cancelled():
                self.logger.warning(f"Stop requested — halting {self.portal_name}")
                break

            try:
                if self.db.is_already_applied(job['job_url']):
                    self.logger.job_skipped(f"Already applied: {job['role']}")
                    continue

                if await self._evaluate_and_apply(job, dry_run):
                    self.applications_count += 1

            except Exception as e:
                self.logger.error(
                    f"Error processing job {job.get('role', 'Unknown')}: {e}", exc_info=True
                )
                self.db.log_portal_event(
                    self.portal_name, 'ERROR',
                    f"Error processing job: {job.get('role', 'Unknown')}", str(e),
                )
                continue

        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count

    async def _process_single_page(self, max_applications: int = 5,
                                   dry_run: bool = False) -> int:
        """Flow for portals whose listing reloads after each apply (LinkedIn Easy
        Apply, Naukri / Instahyre checkbox-and-popup).

        The listing returns the same cards every round, and a dry-run never writes
        to the DB, so we track handled jobs in an in-session ``attempted`` set and
        advance to the next *unseen* match each round. That's what makes it apply
        to N DIFFERENT jobs instead of looping on the first match forever.
        """
        if not await self._prepare_portal(max_applications):
            return self.applications_count

        remaining = max_applications - self.db.get_applications_today(self.portal_name)

        attempted: set = set()
        empty_rounds = 0

        while self.applications_count < remaining:
            if self.bridge is not None and await self.bridge.cancelled():
                self.logger.warning(f"Stop requested — halting {self.portal_name}")
                break

            try:
                jobs = await self.search_jobs()
                self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")

                # Next candidate we haven't already tried (this run or in the DB).
                job = None
                for candidate in jobs:
                    key = candidate['job_url']
                    if key in attempted:
                        continue
                    if self.db.is_already_applied(key):
                        attempted.add(key)
                        continue
                    job = candidate
                    break

                if job is None:
                    empty_rounds += 1
                    if empty_rounds >= 2:
                        self.logger.info(f"No more matching jobs - completing {self.portal_name}")
                        break
                    await asyncio.sleep(2)  # let the list lazy-load more cards
                    continue

                empty_rounds = 0
                attempted.add(job['job_url'])  # handled regardless of outcome

                if await self._evaluate_and_apply(job, dry_run):
                    self.applications_count += 1

            except Exception as e:
                self.logger.error(f"Error in {self.portal_name} loop: {e}", exc_info=True)
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

    # ── OmniTask integration helpers (only used when self.bridge is set) ──────

    def _app_record(self, job: Dict, match_result: Dict, status: str,
                    error: Optional[str] = None) -> Dict[str, Any]:
        """Build the application:result payload streamed to the dashboard."""
        record = {
            'portal': self.portal_name,
            'externalJobId': str(
                job.get('job_id') or job.get('job_url') or job.get('role') or ''
            )[:200],
            'title': job.get('role'),
            'company': job.get('company'),
            'location': job.get('location'),
            'url': job.get('job_url'),
            'score': match_result.get('match_score', 0),
            'matchReasons': match_result.get('reasons', []),
            'status': status,
        }
        if error:
            record['error'] = error
        return record

    async def _bridged_apply(self, job: Dict, match_result: Dict,
                             dry_run: bool) -> bool:
        """Stream the candidate, gate the submit, then apply (or dry-run).

        Returns True when this candidate should count toward the limit (a real
        submit or a dry-run approval). Approval denial/timeout is non-fatal: the
        job is recorded SKIPPED and the loop continues to the next one.
        """
        await self.bridge.emit_application(
            self._app_record(job, match_result, 'PENDING_APPROVAL')
        )

        approved = await self.bridge.gate(job, match_result)
        if not approved:
            self.logger.warning(
                f"Approval denied/timeout: {job.get('role')} at {job.get('company')}"
            )
            await self.bridge.emit_application(
                self._app_record(job, match_result, 'SKIPPED',
                                 error='Approval denied or timed out')
            )
            return False

        # Dry-run: full flow + approval, but stop before the real submit.
        if dry_run:
            self.logger.info(
                f"[DRY RUN] Approved, not submitting: {job.get('role')} at {job.get('company')}"
            )
            await self.bridge.emit_application(
                self._app_record(job, match_result, 'MATCHED',
                                 error='dry-run: submit skipped')
            )
            return True

        try:
            success = await self.apply_to_job(job)
        except Exception as exc:  # noqa: BLE001 — one bad apply must not abort the run
            self.logger.error(f"apply_to_job failed: {exc}", exc_info=True)
            await self.bridge.emit_application(
                self._app_record(job, match_result, 'FAILED', error=str(exc))
            )
            return False

        if not success:
            await self.bridge.emit_application(
                self._app_record(job, match_result, 'FAILED',
                                 error='Portal apply returned false')
            )
            return False

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
            application_method='automated',
        )
        self.logger.job_applied(self.portal_name, job['company'], job['role'])
        await self.bridge.emit_application(
            self._app_record(job, match_result, 'APPLIED')
        )
        await asyncio.sleep(self.wait_time)
        return True
