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
from src.agent.job_queue import JobQueue, JobState, card_key, normalize
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

        # Cognitive engine — the Claude reasoning loop (LLM-first). None → the
        # rule-based selector flow only. Set by the orchestrator when an
        # ANTHROPIC_API_KEY is configured.
        self.cognition = None
    
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

    def _score_job(self, job: Dict) -> Dict:
        """Run the rule-based matcher (the FILTER stage) and stamp the score.

        Returns the match_result; `should_apply` decides queue COMPLETE vs SKIP.
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
        return match_result

    async def _apply_scored(self, job: Dict, match_result: Dict, dry_run: bool) -> str:
        """Apply to an already-scored, should-apply job.

        Returns one of: 'APPLIED' (real submit), 'MATCHED' (dry-run, counts),
        'DENIED' (approval refused — terminal skip), 'FAILED' (retryable). The
        queue worker turns these into COMPLETED / SKIPPED / retry-or-FAILED.

        Terminal records (APPLIED / MATCHED / DENIED) are streamed here; FAILED is
        emitted by the worker only once retries are exhausted, to avoid flicker.
        """
        self.logger.job_found(self.portal_name, job.get('company', ''), job['role'])

        # ── OmniTask bridged path: stream + gate the submit ───────────────────
        if self.bridge is not None:
            await self.bridge.emit_application(
                self._app_record(job, match_result, 'PENDING_APPROVAL')
            )
            if not await self.bridge.gate(job, match_result):
                self.logger.warning(
                    f"Approval denied/timeout: {job.get('role')} at {job.get('company')}"
                )
                await self.bridge.emit_application(
                    self._app_record(job, match_result, 'SKIPPED',
                                     error='Approval denied or timed out')
                )
                return 'DENIED'

            if dry_run:
                self.logger.info(
                    f"[DRY RUN] Approved, not submitting: {job.get('role')}"
                )
                await self.bridge.emit_application(
                    self._app_record(job, match_result, 'MATCHED',
                                     error='dry-run: submit skipped')
                )
                return 'MATCHED'

            try:
                success = await self.apply_to_job(job)
            except Exception as exc:  # noqa: BLE001 — one bad apply must not abort the run
                self.logger.error(f"apply_to_job failed: {exc}", exc_info=True)
                return 'FAILED'
            if not success:
                return 'FAILED'

            self._record_application(job)
            self.logger.job_applied(self.portal_name, job['company'], job['role'])
            await self.bridge.emit_application(self._app_record(job, match_result, 'APPLIED'))
            await asyncio.sleep(self.wait_time)
            return 'APPLIED'

        # ── Standalone CLI path ───────────────────────────────────────────────
        if dry_run:
            self.logger.info(f"[DRY RUN] Would apply to: {job['role']}")
            return 'MATCHED'
        try:
            success = await self.apply_to_job(job)
        except Exception as exc:  # noqa: BLE001
            self.logger.error(f"apply_to_job failed: {exc}", exc_info=True)
            return 'FAILED'
        if not success:
            return 'FAILED'
        self._record_application(job)
        self.logger.job_applied(self.portal_name, job.get('company', ''), job['role'])
        await asyncio.sleep(self.wait_time)
        return 'APPLIED'

    def _record_application(self, job: Dict) -> None:
        """Persist an applied job to the local SQLite tracker (dedup source)."""
        self.db.add_application(
            portal=self.portal_name,
            company=job.get('company', ''),
            role=job['role'],
            job_url=job['job_url'],
            job_id=job.get('job_id'),
            job_description=job.get('description'),
            location=job.get('location'),
            salary=job.get('salary'),
            match_score=job.get('match_score'),
            application_method='automated',
        )

    async def _emit_queue(self, queue: JobQueue) -> None:
        """Mirror live queue counts to the dashboard (no-op in standalone mode)."""
        if self.bridge is not None and hasattr(self.bridge, 'emit_queue'):
            try:
                await self.bridge.emit_queue(self.portal_name, queue.counts())
            except Exception:
                pass

    async def _drain_queue(self, queue: JobQueue, remaining: int, dry_run: bool) -> None:
        """The WORKER: pull PENDING jobs, FILTER (score), apply, and advance the
        state machine — COMPLETED / SKIPPED / retry-or-FAILED — until the queue is
        empty, the limit is hit, or the user stops.
        """
        await self._emit_queue(queue)
        while queue.has_pending() and self.applications_count < remaining:
            if self.bridge is not None and await self.bridge.cancelled():
                self.logger.warning(f"Stop requested — halting {self.portal_name}")
                break

            qj = queue.next_pending()
            if qj is None:
                break
            await self._emit_queue(queue)
            job = qj.job

            try:
                match_result = self._score_job(job)
                if not match_result['should_apply']:
                    self.logger.job_skipped(f"{job['role']} - Score: {job.get('match_score')}")
                    queue.skip(qj, 'below min match score')
                    if self.bridge is not None:
                        await self.bridge.emit_application(
                            self._app_record(job, match_result, 'SKIPPED')
                        )
                    await self._emit_queue(queue)
                    continue

                result = await self._apply_scored(job, match_result, dry_run)
                if result in ('APPLIED', 'MATCHED'):
                    queue.complete(qj)
                    self.applications_count += 1
                elif result == 'DENIED':
                    queue.skip(qj, 'approval denied')
                else:  # FAILED — retry or give up
                    state = queue.requeue_or_fail(qj, 'apply failed')
                    if state == JobState.FAILED and self.bridge is not None:
                        await self.bridge.emit_application(
                            self._app_record(job, match_result, 'FAILED',
                                             error='Apply failed after retries')
                        )
                    else:
                        self.logger.info(f"Retrying later: {job.get('role')}")
                await self._emit_queue(queue)

            except Exception as e:
                self.logger.error(
                    f"Error processing job {job.get('role', 'Unknown')}: {e}", exc_info=True
                )
                self.db.log_portal_event(
                    self.portal_name, 'ERROR',
                    f"Error processing job: {job.get('role', 'Unknown')}", str(e),
                )
                state = queue.requeue_or_fail(qj, str(e))
                if state == JobState.FAILED and self.bridge is not None:
                    await self.bridge.emit_application({
                        **self._app_record(job, {'match_score': job.get('match_score', 0)},
                                           'FAILED', error=str(e)),
                    })
                await self._emit_queue(queue)

    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """Default flow for portals that list every job up-front: search once into
        the queue, then drain it through the worker state machine.

        Args:
            max_applications: Maximum applications to submit
            dry_run: If True, run the full flow but don't actually submit

        Returns:
            Number of applications submitted
        """
        if not await self._prepare_portal(max_applications):
            return self.applications_count

        remaining = max_applications - self.db.get_applications_today(self.portal_name)
        queue = JobQueue(max_attempts=2)

        jobs = await self.search_jobs()
        self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")
        for job in jobs:
            if self.db.is_already_applied(job['job_url']):
                self.logger.job_skipped(f"Already applied: {job['role']}")
                continue
            queue.add(job)

        await self._drain_queue(queue, remaining, dry_run)
        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count

    async def _process_single_page(self, max_applications: int = 5,
                                   dry_run: bool = False) -> int:
        """Flow for portals whose listing reloads after each apply (LinkedIn Easy
        Apply, Naukri / Instahyre checkbox-and-popup).

        The listing returns the same cards every round (reordered), so we re-run
        ``search_jobs`` to top the queue up with *newly seen* jobs (dedup by stable
        card key, not position), then drain the queue. ``apply_to_job`` re-locates
        each card by title via ``_relocate_card`` — never by raw index — which is
        what stops it clicking the same/wrong card forever.
        """
        if not await self._prepare_portal(max_applications):
            return self.applications_count

        remaining = max_applications - self.db.get_applications_today(self.portal_name)
        queue = JobQueue(max_attempts=2)
        empty_rounds = 0

        while self.applications_count < remaining:
            if self.bridge is not None and await self.bridge.cancelled():
                self.logger.warning(f"Stop requested — halting {self.portal_name}")
                break

            # Top up the queue with any newly visible, not-yet-seen, not-applied jobs.
            added = 0
            try:
                jobs = await self.search_jobs()
                self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")
                for job in jobs:
                    if queue.is_known(job):
                        continue
                    if self.db.is_already_applied(job['job_url']):
                        continue
                    if queue.add(job):
                        added += 1
            except Exception as e:
                self.logger.error(f"Error searching {self.portal_name}: {e}", exc_info=True)

            if not queue.has_pending():
                empty_rounds += 1
                if empty_rounds >= 2:
                    self.logger.info(f"No more matching jobs - completing {self.portal_name}")
                    break
                await asyncio.sleep(2)  # let the list lazy-load more cards
                continue
            empty_rounds = 0

            await self._drain_queue(queue, remaining, dry_run)

            # If draining the current queue produced no new pending work and a
            # re-search added nothing, we're done.
            if added == 0 and not queue.has_pending():
                break

        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count

    # ── Stable card re-location (replaces fragile positional indexing) ────────

    async def _card_title(self, card) -> str:
        """Best-effort job title from a listing card. Portals may override with
        their own selectors; the default tries common ones then first text line."""
        for selector in ('.job-card-list__title', 'a.title', '.title',
                         'h2', 'h3', 'strong', 'b'):
            try:
                el = await card.query_selector(selector)
                if el:
                    txt = (await el.inner_text()).strip()
                    if len(txt) > 2:
                        return txt
            except Exception:
                continue
        try:
            text = (await card.inner_text()).strip()
            line = next((l.strip() for l in text.split('\n') if l.strip()), '')
            return line
        except Exception:
            return ''

    async def _relocate_card(self, cards: list, job: Dict):
        """Find the card matching this job by TITLE (stable across reorders).

        Falls back to the positional ``card_index`` only when no title matches.
        Returns the card handle or None.
        """
        want = normalize(job.get('role'))
        if want:
            for card in cards:
                title = normalize(await self._card_title(card))
                if title and (want in title or title in want):
                    return card
        idx = job.get('card_index')
        if isinstance(idx, int) and 0 <= idx < len(cards):
            return cards[idx]
        return None


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

    # ── Cognitive (LLM-first) application path ────────────────────────────────
    #
    # When a Claude engine is configured, portals hand the brittle, layout-variable
    # part of an application — completing and submitting the form — to the
    # observe→reason→act→verify loop, falling back to their rule-based flow only
    # when the engine is unavailable or fails for a technical reason.

    def _cognitive_profile(self, job: Dict) -> Dict[str, Any]:
        """Assemble the applicant profile the cognitive loop answers from.

        Drawn from the parsed resume + preferences (the same material the
        rule-based autofill uses) plus the job under consideration. The loop
        treats this as the ONLY source of truth and won't fabricate beyond it.
        """
        ctx = self._answer_context()
        prefs = self.user_preferences or {}
        profile = prefs.get('user_profile', {}) or {}
        p = prefs.get('preferences', {}) or {}
        common = prefs.get('application_settings', {}).get('common_answers', {}) or {}
        locations = p.get('locations') or []
        return {
            'name': ctx['name'],
            'email': ctx['email'],
            'phone': ctx['phone'],
            'location': ctx['location'] or profile.get('current_location')
            or profile.get('location') or (locations[0] if locations else None),
            'years_of_experience': ctx['years'],
            'skills': self.resume_data.get('skills', []),
            'current_company': self.resume_data.get('current_company'),
            'expected_salary': ctx['expected_ctc'],
            'current_salary': str(common.get('current_ctc') or ''),
            'notice_period': ctx['notice'],
            'willing_to_relocate': common.get('willing_to_relocate', 'Yes'),
            'work_authorization': profile.get('work_authorization') or common.get('work_authorization'),
            'requires_sponsorship': profile.get('requires_sponsorship'),
            'linkedin': profile.get('linkedin'),
            'github': profile.get('github'),
            'portfolio': profile.get('portfolio'),
            'common_answers': common,
            'applying_to': {
                'role': job.get('role'),
                'company': job.get('company'),
                'location': job.get('location'),
            },
        }

    async def _cog_emit(self, kind: str, payload: Dict[str, Any]) -> None:
        """Bridge cognitive log/state events to the dashboard (and the local log)."""
        if kind == 'log':
            msg = payload.get('message', '')
            level = payload.get('level', 'info')
            if level == 'error':
                self.logger.error(msg)
            elif level in ('warn', 'warning'):
                self.logger.warning(msg)
            else:
                self.logger.info(msg)
            if self.bridge is not None and hasattr(self.bridge, 'log'):
                await self.bridge.log(msg, level)
        elif kind == 'state':
            if self.bridge is not None and hasattr(self.bridge, 'emit_cognition'):
                await self.bridge.emit_cognition(payload)
        elif kind == 'trajectory':
            if self.bridge is not None and hasattr(self.bridge, 'emit_trajectory'):
                await self.bridge.emit_trajectory(payload)

    async def _complete_application_cognitively(self, page, job: Dict, *,
                                                context_hint: str = "") -> Optional[bool]:
        """Try to complete + submit this application with the cognitive loop.

        Returns:
            True  — submitted (or already applied) → treat as APPLIED.
            False — principled stop (blocked / needs human) → skip the job; do
                    NOT fall back to the fabricating rule-based flow.
            None  — engine unavailable or a technical failure → caller should
                    fall back to its rule-based apply flow.
        """
        engine = getattr(self, 'cognition', None)
        if engine is None:
            return None
        # Local model server (Ollama) reachable? Probe is cached after first call.
        try:
            if not await engine.is_available():
                self.logger.info(
                    "Local AI engine (Ollama) not reachable — using rule-based flow."
                )
                return None
        except Exception as exc:  # noqa: BLE001
            self.logger.info(f"Local AI engine check failed ({exc}); using rule-based flow.")
            return None
        try:
            from src.cognition.applier import CognitiveApplier
        except Exception as exc:  # noqa: BLE001
            self.logger.warning(f"Cognitive engine import failed ({exc}); using rule-based flow.")
            return None
        try:
            applier = CognitiveApplier(engine, page, emit=self._cog_emit, logger=self.logger)
            outcome = await applier.apply(
                job, profile=self._cognitive_profile(job), context_hint=context_hint
            )
        except Exception as exc:  # noqa: BLE001 — any crash → fall back, never abort the run
            self.logger.error(f"Cognitive applier crashed ({exc}); falling back.", exc_info=True)
            return None

        if outcome.submitted:
            return True
        if outcome.should_fallback:
            self.logger.info(
                "Cognitive applier abandoned (technical) — falling back to rule-based flow."
            )
            return None
        self.logger.warning(
            f"Cognitive applier stopped (state={outcome.state.value}): {outcome.summary}"
        )
        return False

    async def _search_jobs_cognitively(self, *, start_url: Optional[str] = None,
                                       max_jobs: int = 25) -> Optional[List[Dict]]:
        """Universal job discovery via observation — works on any site, no
        per-site selectors. Returns job dicts (same shape as `search_jobs`) or
        None when the local engine is unavailable / finds nothing, so the caller
        falls back to its rule-based scrape.
        """
        engine = getattr(self, 'cognition', None)
        if engine is None:
            return None
        try:
            if not await engine.is_available():
                return None
        except Exception:  # noqa: BLE001
            return None
        try:
            from src.cognition.search.searcher import CognitiveSearcher
        except Exception as exc:  # noqa: BLE001
            self.logger.warning(f"Cognitive search import failed ({exc}); using rule-based search.")
            return None
        try:
            page = self.browser.get_page()
            searcher = CognitiveSearcher(engine, page, emit=self._cog_emit, logger=self.logger)
            prefs = (self.user_preferences or {}).get('preferences', {}) or {}
            jobs = await searcher.find_jobs(
                portal=self.portal_name, start_url=start_url,
                max_jobs=max_jobs, preferences=prefs,
            )
            return jobs or None
        except Exception as exc:  # noqa: BLE001 — never let search crash the run
            self.logger.error(f"Cognitive search failed ({exc}); falling back.", exc_info=True)
            return None

    # ── Generic application-form auto-fill (shared by every portal) ───────────
    #
    # Portals call `_autofill_form(container)` on any modal/popup/drawer that may
    # hold screening questions, and `_complete_followup_modal(...)` to drive a
    # multi-step questionnaire to completion. Originally written for LinkedIn
    # Easy Apply; reused by Naukri and Instahyre.

    _PLACEHOLDER_OPTIONS = {
        '', 'select an option', 'select', 'select...', 'choose', 'choose an option',
        'please select', '--', '---',
    }

    async def _find_button(self, root, selectors):
        """First visible+enabled button matching any selector, else None.

        ``root`` may be a Page or an ElementHandle — both expose query_selector.
        """
        for selector in selectors:
            try:
                btn = await root.query_selector(selector)
                if btn and await btn.is_visible() and await btn.is_enabled():
                    return btn
            except Exception:
                continue
        return None

    # ── Human-intervention detection ─────────────────────────────────────────
    # Checked before every form-fill step. Returns a string describing what was
    # found ('captcha', 'otp', 'custom_dropdown', 'unknown') or None when the
    # page looks normal and automation can continue.

    _CAPTCHA_MARKERS = [
        # iframes
        'iframe[src*="recaptcha"]',
        'iframe[src*="hcaptcha"]',
        'iframe[title*="reCAPTCHA"]',
        'iframe[title*="hCaptcha"]',
        # challenge containers
        '.g-recaptcha',
        '#captcha',
        '[class*="captcha"]',
        '[id*="captcha"]',
        '[class*="challenge"]',
        'div[data-callback]',          # reCAPTCHA v2 invisible
    ]

    _OTP_MARKERS = [
        'input[autocomplete="one-time-code"]',
        'input[name*="otp"]',
        'input[name*="verification"]',
        'input[placeholder*="OTP"]',
        'input[placeholder*="verification code"]',
        'input[placeholder*="Enter code"]',
    ]

    # Custom-dropdown libraries that our <select> autofill cannot reach.
    _CUSTOM_DROPDOWN_MARKERS = [
        '.select2-container',
        '.choices',
        '[class*="react-select"]',
        '[class*="vue-select"]',
        '[class*="multiselect"]',
    ]

    async def _detect_blocker(self, container) -> Optional[str]:
        """Scan *container* (Page or ElementHandle) for things that need a human.

        Returns the blocker kind string, or None if the coast is clear.
        """
        for sel in self._CAPTCHA_MARKERS:
            try:
                el = await container.query_selector(sel)
                if el and await el.is_visible():
                    return 'captcha'
            except Exception:
                continue
        for sel in self._OTP_MARKERS:
            try:
                el = await container.query_selector(sel)
                if el and await el.is_visible():
                    return 'otp'
            except Exception:
                continue
        for sel in self._CUSTOM_DROPDOWN_MARKERS:
            try:
                el = await container.query_selector(sel)
                if el and await el.is_visible():
                    return 'custom_dropdown'
            except Exception:
                continue
        return None

    async def _handle_blocker(self, blocker: str, job: Dict, page,
                              wait_seconds: int = 90) -> bool:
        """Notify the dashboard and wait *wait_seconds* for the user to resolve.

        Returns True if the blocker appears to have been resolved (element gone),
        False if it's still present after the timeout (→ caller should skip job).
        """
        role = job.get('role', 'this job')
        company = job.get('company', '')
        label = {
            'captcha': 'CAPTCHA',
            'otp': 'OTP / verification code',
            'custom_dropdown': 'custom dropdown (not auto-fillable)',
        }.get(blocker, 'unknown blocker')

        msg = (
            f"⚠️  [{label}] detected for '{role}' at '{company}'. "
            f"Waiting up to {wait_seconds}s for manual resolution — "
            f"complete it in the live browser view and the agent will continue."
        )
        self.logger.warning(msg)

        # Stream a PENDING_APPROVAL-style alert to the dashboard so the user sees it.
        if self.bridge is not None:
            try:
                await self.bridge.emit_application({
                    'portal': self.portal_name,
                    'externalJobId': str(job.get('job_id') or job.get('job_url') or ''),
                    'title': job.get('role'),
                    'company': job.get('company'),
                    'status': 'PENDING_APPROVAL',
                    'error': f'{label} requires manual action in the live browser',
                })
            except Exception:
                pass

        # Poll every 3 s until resolved or timeout.
        for _ in range(wait_seconds // 3):
            await asyncio.sleep(3)
            still_blocked = await self._detect_blocker(page)
            if still_blocked != blocker and still_blocked is None:
                self.logger.info(f"✅ Blocker resolved — resuming automation.")
                return True
        self.logger.warning(
            f"Blocker not resolved in {wait_seconds}s — skipping '{role}'."
        )
        return False

    async def _label_for(self, element):
        """Resolve the human label for a form element (for answer selection)."""
        try:
            return (await element.evaluate(
                """el => {
                    const esc = (s) => (window.CSS && CSS.escape) ? CSS.escape(s) : s;
                    if (el.id) {
                        const l = document.querySelector('label[for="' + esc(el.id) + '"]');
                        if (l && l.innerText.trim()) return l.innerText.trim();
                    }
                    if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
                    const lb = el.getAttribute('aria-labelledby');
                    if (lb) { const n = document.getElementById(lb); if (n && n.innerText.trim()) return n.innerText.trim(); }
                    let node = el;
                    for (let i = 0; i < 5 && node; i++) {
                        node = node.parentElement;
                        if (!node) break;
                        const lab = node.querySelector('label, legend');
                        if (lab && lab.innerText.trim()) return lab.innerText.trim();
                    }
                    return el.placeholder || '';
                }"""
            )) or ''
        except Exception:
            return ''

    def _answer_context(self):
        """Best-guess answer material from preferences + parsed resume."""
        prefs = self.user_preferences or {}
        common = prefs.get('application_settings', {}).get('common_answers', {}) or {}
        profile = prefs.get('user_profile', {}) or {}
        p = prefs.get('preferences', {}) or {}
        raw_years = p.get('experience_years') or self.resume_data.get('experience_years') or 0
        try:
            years = int(float(raw_years))
        except (TypeError, ValueError):
            years = 0

        # Location: explicit profile value wins, then the resume, then the first
        # concrete preferred location (e.g. "Remote"). The yaml key is
        # ``current_location``; also accept ``location`` for forward-compat.
        pref_locations = [str(l).strip() for l in (p.get('locations') or []) if str(l).strip()]
        location = (
            profile.get('current_location') or profile.get('location')
            or self.resume_data.get('location')
            or (pref_locations[0] if pref_locations else '')
        )

        name = profile.get('name') or self.resume_data.get('name') or ''
        first_name = (
            profile.get('first_name') or self.resume_data.get('first_name')
            or (name.split()[0] if name else '')
        )
        last_name = (
            profile.get('last_name') or self.resume_data.get('last_name')
            or (' '.join(name.split()[1:]) if len(name.split()) > 1 else '')
        )

        return {
            'common_answers': common,
            'phone': profile.get('phone') or self.resume_data.get('phone') or '',
            'email': profile.get('email') or self.resume_data.get('email') or '',
            'name': name,
            'first_name': first_name,
            'last_name': last_name,
            'location': location,
            'years': years,
            'expected_ctc': str(common.get('expected_ctc') or ''),
            'notice': str(common.get('notice_period') or '30 days'),
        }

    @staticmethod
    def _digits(text):
        return ''.join(ch for ch in str(text) if ch.isdigit())

    def _yes_no_choice(self, label):
        """Pick Yes/No for an eligibility-style question (best guess)."""
        l = label.lower()
        negative = any(k in l for k in (
            'sponsor', 'require sponsorship', 'disability',
            'convicted', 'felony', 'criminal', 'veteran',
        ))
        return 'No' if negative else 'Yes'

    def _text_answer(self, ctx, label, *, numeric):
        """Best-guess answer for a free-text / numeric field given its label."""
        l = label.lower()
        if 'phone' in l or 'mobile' in l:
            return ctx['phone']
        if 'email' in l:
            return ctx['email']
        # Identity fields — must be matched BEFORE the generic fallback so a
        # name/location field never receives the catch-all interest sentence.
        if 'first name' in l or 'given name' in l:
            return ctx['first_name'] or ctx['name']
        if 'last name' in l or 'surname' in l or 'family name' in l:
            return ctx['last_name'] or ctx['name']
        if 'full name' in l or l.strip() in ('name', 'name*') or l.endswith(' name'):
            return ctx['name']
        # Location / city — the field that previously got "Yes, I am interested…".
        if any(k in l for k in (
            'location', 'city', 'where are you', 'reside', 'based in',
            'hometown', 'home town', 'current town', 'place',
        )):
            return ctx['location']
        if numeric:
            if any(k in l for k in ('salary', 'ctc', 'compensation', 'pay', 'package')):
                return self._digits(ctx['expected_ctc']) or '0'
            # years / experience / "how many" → total experience is a safe guess.
            return str(ctx['years'])
        if 'notice' in l:
            return ctx['notice']
        if 'relocat' in l:
            return 'Yes'
        # Fall back to the rule-based answerer (CTC / notice / why / default).
        # Pass identity/location context so it can answer those too if reached.
        try:
            return self.llm.answer_question(label, {
                'common_answers': ctx['common_answers'],
                'location': ctx['location'],
                'name': ctx['name'],
                'first_name': ctx['first_name'],
                'last_name': ctx['last_name'],
            })
        except Exception:
            return ''

    def _save_answer(self, job, label, answer):
        """Persist one screening answer (best-effort; never breaks the apply)."""
        if not job or not label or answer in (None, ''):
            return
        try:
            self.db.add_answer(job.get('job_url', ''), self.portal_name, str(label), str(answer))
        except Exception:
            pass

    async def _autofill_form(self, container, job=None):
        """Auto-answer every visible field inside a form container (modal / popup
        / drawer) with best-guess values. Pre-filled fields are left untouched.

        When ``job`` is given, each supplied answer is recorded to the ``answers``
        table for that job (question/answer history)."""
        ctx = self._answer_context()

        # 1) Text inputs, number inputs, textareas, and selects.
        try:
            fields = await container.query_selector_all('input, textarea, select')
        except Exception:
            fields = []

        for el in fields:
            try:
                tag = await el.evaluate('el => el.tagName.toLowerCase()')
                type_attr = ((await el.get_attribute('type')) or '').lower()
                if tag == 'input' and type_attr in (
                    'radio', 'checkbox', 'hidden', 'submit', 'button', 'file', 'image'
                ):
                    continue
                if not await el.is_visible():
                    continue
                label = await self._label_for(el)
                if tag == 'select':
                    await self._fill_select(el, label, ctx)
                    continue
                # text / number / textarea — leave pre-filled values alone.
                try:
                    current = (await el.input_value()) or ''
                except Exception:
                    current = ''
                if current.strip():
                    continue
                numeric = type_attr == 'number' or any(
                    k in label.lower() for k in ('how many', 'years', 'number of', 'experience')
                )
                answer = self._text_answer(ctx, label, numeric=numeric)
                if answer:
                    try:
                        await el.fill(str(answer), timeout=5000)
                        self._save_answer(job, label, answer)
                    except Exception:
                        pass
            except Exception:
                continue

        # 2) Radio groups — answer any unanswered group.
        try:
            radios = await container.query_selector_all('input[type="radio"]')
        except Exception:
            radios = []
        groups: Dict[str, list] = {}
        for r in radios:
            try:
                name = (await r.get_attribute('name')) or ''
            except Exception:
                name = ''
            groups.setdefault(name, []).append(r)
        for name, rs in groups.items():
            try:
                if any([await r.is_checked() for r in rs]):
                    continue
                group_label = await self._label_for(rs[0])
                want = self._yes_no_choice(group_label).lower()
                chosen = rs[0]
                for r in rs:
                    rl = (await self._label_for(r)).strip().lower()
                    if rl == want or want in rl.split():
                        chosen = r
                        break
                try:
                    await chosen.check(timeout=4000)
                    self._save_answer(job, group_label, want)
                except Exception:
                    try:
                        await chosen.click(timeout=4000)
                        self._save_answer(job, group_label, want)
                    except Exception:
                        pass
            except Exception:
                continue

        # 3) Checkboxes — tick required agreements, leave the rest (and 'follow').
        try:
            checks = await container.query_selector_all('input[type="checkbox"]')
        except Exception:
            checks = []
        for c in checks:
            try:
                if not await c.is_visible():
                    continue
                label = (await self._label_for(c)).lower()
                if 'follow' in label:
                    continue
                if not await c.is_checked() and any(k in label for k in (
                    'agree', 'terms', 'consent', 'privacy', 'certify', 'acknowledge',
                )):
                    try:
                        await c.check(timeout=4000)
                    except Exception:
                        pass
            except Exception:
                continue

    async def _fill_select(self, el, label, ctx):
        """Choose a sensible option for a <select> still on its placeholder."""
        try:
            selected_text = (await el.evaluate(
                'el => (el.options[el.selectedIndex] ? el.options[el.selectedIndex].text : "").trim()'
            )) or ''
        except Exception:
            selected_text = ''
        if selected_text and selected_text.lower() not in self._PLACEHOLDER_OPTIONS:
            return  # already answered

        try:
            options = await el.query_selector_all('option')
        except Exception:
            options = []
        real = []
        for o in options:
            try:
                val = await o.get_attribute('value')
                txt = ((await o.inner_text()) or '').strip()
            except Exception:
                continue
            if not txt or txt.lower() in self._PLACEHOLDER_OPTIONS:
                continue
            if val is None or val == '':
                val = txt  # some selects use the visible text as the value
            real.append((val, txt))
        if not real:
            return

        want = None
        texts_lower = [t.lower() for _, t in real]
        if 'yes' in texts_lower or 'no' in texts_lower:
            choice_word = self._yes_no_choice(label).lower()
            for val, txt in real:
                if txt.strip().lower() == choice_word:
                    want = val
                    break
        if want is None and any(self._digits(t) for _, t in real):
            target = ctx['years']
            best, best_diff = None, None
            for val, txt in real:
                d = self._digits(txt)
                if not d:
                    continue
                diff = abs(int(d) - target)
                if best_diff is None or diff < best_diff:
                    best, best_diff = val, diff
            want = best
        if want is None:
            want = real[0][0]

        try:
            await el.select_option(value=want, timeout=5000)
        except Exception:
            try:
                await el.select_option(label=want, timeout=5000)
            except Exception:
                pass

    async def _complete_followup_modal(self, page, *, container_selectors,
                                       advance_selectors, success_selectors=(),
                                       max_rounds=6, job=None):
        """Drive a post-apply questionnaire (modal / popup / chatbot drawer) to
        completion: while a questionnaire container is visible, auto-fill it and
        click its advance button (Save / Submit / Continue / Apply), repeating
        until a success marker appears or the container disappears.

        No-op (returns True) when no container is present — i.e. the portal
        applied in one click. Returns False only if it got stuck.
        """
        last_sig = None
        for _ in range(max_rounds):
            # Already done?
            for s in success_selectors:
                try:
                    el = await page.query_selector(s)
                    if el and await el.is_visible():
                        return True
                except Exception:
                    continue

            container = None
            for sel in container_selectors:
                try:
                    c = await page.query_selector(sel)
                    if c and await c.is_visible():
                        container = c
                        break
                except Exception:
                    continue
            if container is None:
                return True  # nothing (more) to fill

            # Fingerprint the questionnaire so a step that never advances after a
            # fill+click is abandoned instead of re-clicked until max_rounds.
            try:
                sig = await container.evaluate(
                    "el => (el.innerText || '').length + ':' "
                    "+ el.querySelectorAll('input,select,textarea').length"
                )
            except Exception:
                sig = None
            if sig is not None and sig == last_sig:
                self.logger.warning("Follow-up questionnaire did not advance — stopping.")
                return False
            last_sig = sig

            self.logger.info("📝 Answering follow-up questionnaire...")
            await self._autofill_form(container, job=job)
            await asyncio.sleep(0.5)

            btn = (await self._find_button(container, advance_selectors)
                   or await self._find_button(page, advance_selectors))
            if not btn:
                return True  # filled; let the caller's confirmation check decide
            try:
                await btn.click(timeout=8000)
                await asyncio.sleep(2)
            except Exception:
                return False
        return False

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
