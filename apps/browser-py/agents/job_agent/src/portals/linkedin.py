"""
LinkedIn Portal Implementation with Easy Apply
"""

from typing import Dict, List
import asyncio
from .base_portal import BasePortal


class LinkedInPortal(BasePortal):
    """LinkedIn job portal implementation with Easy Apply workflow."""
    
    async def verify_login(self) -> bool:
        """Check if user is logged in to LinkedIn."""
        try:
            current_url = await self.browser.get_url()
            self.logger.debug(f"Checking LinkedIn login at: {current_url}")
            
            # If we're on feed page or jobs page, we're logged in!
            if current_url and ('/feed/' in current_url or '/jobs/' in current_url or 'linkedin.com/in/' in current_url):
                self.logger.debug("✓ Detected logged in - on feed/jobs/profile page")
                return True
            
            # Check if on login page
            if '/login' in current_url.lower() or '/uas/login' in current_url.lower():
                self.logger.debug("On login page - not logged in")
                return False
            
            # Check for profile/nav indicators
            page = self.browser.get_page()
            profile_selectors = [
                'img.global-nav__me-photo',
                '.global-nav__me',
                'button[data-control-name="nav.settings_signout"]',
                '[data-control-name="identity_profile_photo"]',
                'nav.global-nav',
                '.feed-identity-module',
            ]
            
            for selector in profile_selectors:
                try:
                    # NOTE: query_selector takes NO timeout kwarg — passing one
                    # raises TypeError and silently breaks this whole fallback.
                    elem = await page.query_selector(selector)
                    if elem:
                        self.logger.debug(f"✓ Found login indicator: {selector}")
                        return True
                except:
                    continue
            
            self.logger.debug("No login indicators found")
            return False
        except Exception as e:
            self.logger.debug(f"Error verifying LinkedIn login: {e}")
            return False
    
    async def login(self) -> bool:
        """Login to LinkedIn — auto-fills credentials if provided, else waits for manual login."""
        try:
            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)

            if await self.verify_login():
                self.logger.info("✅ Already logged in to LinkedIn!")
                return True

            # Auto-fill credentials if provided via wizard
            creds = self.user_preferences.get('credentials', {}).get('linkedin', {})
            if creds.get('email') and creds.get('password'):
                self.logger.info("🔑 Auto-filling LinkedIn credentials...")
                try:
                    page = self.browser.get_page()
                    await page.fill('#username', creds['email'])
                    await asyncio.sleep(0.5)
                    await page.fill('#password', creds['password'])
                    await asyncio.sleep(0.5)
                    await page.click('button[type="submit"]')
                    await asyncio.sleep(4)
                    if await self.verify_login():
                        self.logger.info("✅ Auto-login to LinkedIn successful!")
                        return True
                    self.logger.warning("⚠️ Auto-login did not complete (2FA?), falling back to manual wait...")
                except Exception as e:
                    self.logger.warning(f"Auto-login attempt failed: {e}, falling back to manual...")

            # Manual login fallback
            self.logger.warning("⚠️  Please log in to LinkedIn in the browser window (120 s)...")
            for i in range(24):
                await asyncio.sleep(5)
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)
                    return True

            self.logger.error("❌ Login timeout")
            return False

        except Exception as e:
            self.logger.error(f"Error during LinkedIn login: {e}", exc_info=True)
            return False
    
    async def search_jobs(self) -> List[Dict]:
        """Get Easy Apply jobs from LinkedIn.
        
        NOTE: LinkedIn Easy Apply workflow:
        - Jobs are listed on left side
        - Skip jobs showing "Applied X days ago"
        - Get only jobs with "Easy Apply" button
        """
        # ── Cognitive (LLM-first) universal search ────────────────────────────
        # When the local engine is up, discover postings by observation+reasoning
        # (no LinkedIn-specific selectors). Falls through to the hardcoded scrape
        # below when the engine is unavailable or finds nothing.
        cog_jobs = await self._search_jobs_cognitively(
            start_url="https://www.linkedin.com/jobs/collections/easy-apply/",
            max_jobs=30,
        )
        if cog_jobs:
            self.logger.info(f"🧠 Cognitive search found {len(cog_jobs)} jobs")
            return cog_jobs

        jobs = []

        try:
            # Go to Easy Apply jobs collection
            search_url = "https://www.linkedin.com/jobs/collections/easy-apply/"
            
            self.logger.info(f"Searching LinkedIn Easy Apply jobs: {search_url}")
            await self.browser.goto(search_url)
            await asyncio.sleep(5)
            
            page = self.browser.get_page()
            
            # Wait for job list to load
            try:
                await page.wait_for_selector('.jobs-search-results-list', timeout=10000)
            except:
                self.logger.warning("Job list did not load in time")
            
            await asyncio.sleep(3)
            
            # Scroll to load more jobs on LEFT side
            jobs_list = await page.query_selector('.jobs-search-results-list, .scaffold-layout__list')
            if jobs_list:
                for _ in range(3):
                    try:
                        await jobs_list.evaluate('el => el.scrollTo(0, el.scrollHeight)')
                        await asyncio.sleep(2)
                    except:
                        pass
            
            # Get all job cards from left panel
            job_cards = []
            card_selectors = [
                '.job-card-container',
                '.jobs-search-results__list-item',
                'li.jobs-search-results__list-item',
                '.scaffold-layout__list-item',
            ]
            
            for selector in card_selectors:
                job_cards = await page.query_selector_all(selector)
                if job_cards and len(job_cards) > 0:
                    self.logger.debug(f"Found {len(job_cards)} cards with selector: {selector}")
                    break
            
            self.logger.info(f"Found {len(job_cards)} job cards on LinkedIn")
            
            # Extract job details from each card
            for idx, card in enumerate(job_cards[:30]):  # Limit to first 30
                try:
                    # Check if already applied
                    already_applied = False
                    try:
                        applied_text = await card.query_selector('text=Applied')
                        if applied_text:
                            self.logger.debug(f"Skipping job {idx} - already applied")
                            already_applied = True
                            continue
                    except:
                        pass
                    
                    if already_applied:
                        continue
                    
                    # Get title
                    title = ''
                    for selector in ['.job-card-list__title', 'strong', 'h3', '.job-card-container__link']:
                        title_elem = await card.query_selector(selector)
                        if title_elem:
                            title = await title_elem.inner_text()
                            if title and len(title.strip()) > 2:
                                title = title.strip()
                                break
                    
                    # Get company
                    company = ''
                    for selector in ['.job-card-container__company-name', '.artdeco-entity-lockup__subtitle', 'span']:
                        company_elem = await card.query_selector(selector)
                        if company_elem:
                            company = await company_elem.inner_text()
                            if company and len(company.strip()) > 2:
                                company = company.strip()
                                break
                    
                    if title:
                        jobs.append({
                            'role': title,
                            'company': company,
                            # Unique per card so dedup / DB / approval records
                            # don't collide (the collection URL is shared by all).
                            'job_url': f'{search_url}#card{idx}',
                            'job_id': f'linkedin_{idx}',
                            'card_index': idx,  # Track which card to click
                            'portal': 'LinkedIn'
                        })
                except Exception as e:
                    self.logger.debug(f"Error extracting job card {idx}: {e}")
                    continue
            
        except Exception as e:
            self.logger.error(f"Error searching LinkedIn jobs: {e}", exc_info=True)
        
        return jobs
    
    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """LinkedIn Easy Apply: the listing reloads after each submit, so use the
        shared single-page loop (search → next unseen match → Easy Apply → repeat).

        Per-job mechanics live in `search_jobs` (unique `job_url` per card) and
        `apply_to_job` (multi-step Easy Apply form).
        """
        return await self._process_single_page(max_applications, dry_run)
    
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a job on LinkedIn using Easy Apply workflow.
        
        WORKFLOW:
        1. Click job card on left to view details
        2. Click "Easy Apply" button
        3. Multi-step form appears in popup/overlay:
           - Contact info (auto-filled)
           - Resume (already uploaded)
           - Experience, education, etc.
           - Keep clicking "Next" (scroll to bottom if needed)
           - Click "Review" button
           - Scroll to bottom
           - UNCHECK "Follow company" checkbox
           - Click "Submit application"
        4. Acknowledgment popup: "Your application was sent to {company}!"
        5. Click "Done" button
        """
        try:
            page = self.browser.get_page()
            card_index = job.get('card_index', 0)
            
            self.logger.info(f"Processing LinkedIn job card #{card_index}: {job['role']}")
            
            # Make sure we're on Easy Apply page
            current_url = await self.browser.get_url()
            if 'easy-apply' not in current_url:
                self.logger.info("Navigating to LinkedIn Easy Apply page...")
                await self.browser.goto("https://www.linkedin.com/jobs/collections/easy-apply/")
                await asyncio.sleep(3)
            
            # Re-fetch job cards
            await asyncio.sleep(2)
            job_cards = []
            card_selectors = [
                '.job-card-container',
                '.jobs-search-results__list-item',
                'li.jobs-search-results__list-item',
            ]
            
            for selector in card_selectors:
                job_cards = await page.query_selector_all(selector)
                if job_cards and len(job_cards) > 0:
                    break

            self.logger.debug(f"Found {len(job_cards)} cards on page")

            # Re-locate THIS job's card by title (stable across reorders) — never
            # trust the raw index, which drifts as applied jobs leave the list.
            card = await self._relocate_card(job_cards, job)
            if card is None:
                self.logger.warning(
                    f"Could not re-locate card for '{job.get('role')}' (have {len(job_cards)} cards)"
                )
                return False
            
            # Click job card to view details on right side
            self.logger.info("Clicking job card to view details...")
            try:
                await card.click(timeout=10000)
                await asyncio.sleep(3)
            except Exception as e:
                self.logger.error(f"Failed to click job card: {e}")
                return False
            
            # Find and click "Easy Apply" button
            easy_apply_button = None
            easy_apply_selectors = [
                'button.jobs-apply-button',
                'button:has-text("Easy Apply")',
                '.jobs-apply-button--top-card',
                'button[aria-label*="Easy Apply"]',
                '.jobs-apply-button',
            ]
            
            self.logger.debug("Looking for Easy Apply button...")
            for selector in easy_apply_selectors:
                try:
                    easy_apply_button = await page.query_selector(selector)
                    if easy_apply_button:
                        is_visible = await easy_apply_button.is_visible()
                        is_enabled = await easy_apply_button.is_enabled()
                        if is_visible and is_enabled:
                            button_text = await easy_apply_button.inner_text()
                            self.logger.info(f"✅ Found Easy Apply button: '{button_text}'")
                            break
                except Exception as e:
                    self.logger.debug(f"Error checking {selector}: {e}")
                    continue
            
            if not easy_apply_button:
                self.logger.warning(f"Easy Apply button not found for {job['role']}")
                return False
            
            # Click Easy Apply button to open form popup
            self.logger.info("Clicking Easy Apply button...")
            try:
                await easy_apply_button.click(timeout=10000)
                await asyncio.sleep(3)
            except Exception as e:
                self.logger.error(f"Failed to click Easy Apply button: {e}")
                return False
            
            # Wait for modal/popup to appear
            modal_selectors = [
                '.jobs-easy-apply-modal',
                '[role="dialog"]',
                '.artdeco-modal',
                '[data-test-modal]',
            ]
            
            modal = None
            for selector in modal_selectors:
                try:
                    modal = await page.wait_for_selector(selector, timeout=5000)
                    if modal:
                        self.logger.info(f"✅ Easy Apply modal appeared: {selector}")
                        break
                except:
                    continue
            
            if not modal:
                self.logger.warning("Easy Apply modal did not appear")
                return False

            # ── Cognitive (LLM-first) completion ──────────────────────────────
            # Hand the open Easy Apply form to the Claude reasoning loop, which
            # completes arbitrary multi-step / screening-question layouts
            # generically (observe→reason→act→verify). Returns True (submitted) /
            # False (blocked — honest skip). Returns None when the engine is
            # unavailable or fails technically, in which case we fall through to
            # the deterministic selector flow below.
            cog = await self._complete_application_cognitively(
                page, job,
                context_hint=(
                    "The LinkedIn Easy Apply modal is now open for this job. "
                    "The resume is typically already attached. Complete every step "
                    "(contact info, screening questions, review), uncheck 'Follow "
                    "company', and submit the application."
                ),
            )
            if cog is not None:
                return cog

            # ── Multi-step form: fill every step, then advance, until we can
            #    submit. LinkedIn blocks Next/Submit while required fields are
            #    empty, so we auto-answer each step and detect a stuck step
            #    instead of clicking a dead button forever.
            max_steps = 15  # generous: long forms can have many pages
            submitted = False

            for step in range(max_steps):
                self.logger.info(f"📝 Step {step + 1}: filling form...")
                await asyncio.sleep(1.5)

                # Best-guess answers for every visible field on this step.
                await self._autofill_form(modal, job=job)

                # Scroll the modal so the footer action button is in view.
                try:
                    await modal.evaluate('el => el.scrollTo(0, el.scrollHeight)')
                    await asyncio.sleep(0.8)
                except Exception:
                    pass

                # Submit takes priority — if it's here, we're done filling.
                submit_button = await self._find_button(
                    modal,
                    ['button[aria-label*="Submit application"]',
                     'button:has-text("Submit application")',
                     'button:has-text("Submit")'],
                )
                if submit_button:
                    await self._handle_follow_checkbox(modal)
                    self.logger.info(f"🚀 Submitting application for: {job['role']}")
                    try:
                        await submit_button.click(timeout=10000)
                        await asyncio.sleep(3)
                        submitted = True
                    except Exception as e:
                        self.logger.error(f"Failed to click Submit: {e}")
                    break

                # Review → click and loop again (Submit usually appears next).
                review_button = await self._find_button(
                    modal,
                    ['button[aria-label*="Review"]',
                     'button:has-text("Review")'],
                )
                if review_button:
                    self.logger.info("✅ Review button — clicking...")
                    try:
                        await review_button.click(timeout=10000)
                        await asyncio.sleep(2)
                    except Exception:
                        pass
                    continue

                # Otherwise advance with Next, and confirm we actually moved on.
                next_button = await self._find_button(
                    modal,
                    ['button[aria-label*="Continue to next step"]',
                     'button:has-text("Next")',
                     'button[aria-label*="Next"]'],
                )
                if not next_button:
                    self.logger.info("No Next/Review/Submit button — assuming end of form.")
                    break

                sig_before = await self._modal_signature(modal)
                try:
                    await next_button.click(timeout=10000)
                    await asyncio.sleep(1.8)
                except Exception as e:
                    self.logger.warning(f"Next click failed: {e}")

                if await self._modal_signature(modal) == sig_before:
                    # Validation blocked us. Re-fill (we may have missed a field)
                    # and try once more; if still stuck, give up on this job.
                    self.logger.info("Step did not advance — re-filling and retrying...")
                    await self._autofill_form(modal, job=job)
                    try:
                        await next_button.click(timeout=8000)
                        await asyncio.sleep(1.8)
                    except Exception:
                        pass
                    if await self._modal_signature(modal) == sig_before:
                        self.logger.warning(
                            f"Stuck on a required field for {job['role']} — skipping job."
                        )
                        await self._dismiss_modal(page)
                        return False

            if not submitted:
                self.logger.warning(
                    f"Reached end of Easy Apply flow without submitting for {job['role']}"
                )
                await self._dismiss_modal(page)
                return False

            # ── Confirm + dismiss the acknowledgement popup ─────────────────
            confirmation_found = False
            for selector in ('text=Your application was sent',
                             'text=Application sent',
                             'text=successfully submitted'):
                try:
                    await page.wait_for_selector(selector, timeout=4000)
                    self.logger.info(f"✅ Application confirmed: {selector}")
                    confirmation_found = True
                    break
                except Exception:
                    continue

            done_button = await self._find_button(
                page,
                ['button:has-text("Done")',
                 'button[aria-label="Dismiss"]',
                 'button:has-text("Dismiss")'],
            )
            if done_button:
                try:
                    await done_button.click(timeout=8000)
                    await asyncio.sleep(1.5)
                except Exception:
                    pass

            if confirmation_found:
                self.logger.info(f"🎉 Applied to {job['role']} at {job.get('company','')}")
            else:
                self.logger.info(
                    "Submit clicked but no explicit confirmation text seen — treating as applied."
                )
            return True

        except Exception as e:
            self.logger.error(f"Error applying to LinkedIn job: {e}", exc_info=True)
            await self._dismiss_modal(page)
            return False

    # ── LinkedIn-specific Easy Apply helpers ─────────────────────────────────
    # The generic form auto-fill (_autofill_form / _fill_select / _find_button /
    # _label_for / answer helpers / _complete_followup_modal) now lives in
    # BasePortal and is shared with Naukri + Instahyre. Only the bits below are
    # specific to LinkedIn's Easy Apply modal.

    async def _dismiss_modal(self, page):
        """Best-effort close of an open Easy Apply modal (and 'discard' prompt)."""
        try:
            close_btn = await page.query_selector('button[aria-label="Dismiss"]')
            if close_btn and await close_btn.is_visible():
                await close_btn.click()
                await asyncio.sleep(1)
                # LinkedIn asks to confirm discarding the draft.
                discard = await page.query_selector(
                    'button[data-control-name="discard_application_confirm_btn"], '
                    'button:has-text("Discard")'
                )
                if discard and await discard.is_visible():
                    await discard.click()
                    await asyncio.sleep(0.5)
        except Exception:
            pass

    async def _modal_signature(self, modal):
        """A cheap fingerprint of the current form step.

        Used to detect whether clicking Next actually advanced the form: LinkedIn
        keeps you on the same step (and shows an inline error) when a required
        field is still invalid.
        """
        try:
            return await modal.evaluate(
                """el => {
                    const h = el.querySelector('h3, h2, .t-16, [data-test-form-section]');
                    const heading = h ? h.innerText.trim() : '';
                    const fields = el.querySelectorAll('input, select, textarea').length;
                    const err = el.querySelectorAll('[role="alert"], .artdeco-inline-feedback--error').length;
                    return heading + '|' + fields + '|' + err;
                }"""
            )
        except Exception:
            return ''

    async def _handle_follow_checkbox(self, modal):
        """Uncheck the 'Follow <company>' checkbox before submitting."""
        try:
            checks = await modal.query_selector_all('input[type="checkbox"]')
        except Exception:
            checks = []
        for c in checks:
            try:
                label = (await self._label_for(c)).lower()
                if 'follow' in label and await c.is_checked():
                    self.logger.info("Unchecking 'Follow company'...")
                    try:
                        await c.uncheck(timeout=4000)
                    except Exception:
                        await c.click(timeout=4000)
                    return
            except Exception:
                continue


if __name__ == "__main__":
    print("LinkedIn portal implementation ready")
