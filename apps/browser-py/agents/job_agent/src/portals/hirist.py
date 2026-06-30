"""
Hirist Portal Implementation
"""

from typing import Dict, List
import asyncio
import re
from .base_portal import BasePortal


class HiristPortal(BasePortal):
    """Hirist.tech job portal implementation."""

    def _build_search_url(self) -> str:
        """Build a role-based Hirist search URL from the user's entered roles.

        Hirist keyword searches use the `/k/<slug>-jobs` path (e.g.
        `/k/nodejs-jobs`, `/k/frontend-developer-jobs`). Falls back to a general
        software-developer feed when no role is configured (NOT the old hardcoded
        AI/ML category, which mismatched non-AI users)."""
        prefs = (self.user_preferences or {}).get('preferences', {}) or {}
        roles = [str(r).strip() for r in (prefs.get('roles') or []) if str(r).strip()]
        if not roles:
            return "https://www.hirist.tech/k/software-developer-jobs?ref=topnavigation"
        slug = re.sub(r'[^a-z0-9]+', '-', roles[0].lower()).strip('-')
        slug = re.sub(r'-?jobs?$', '', slug).strip('-') or 'software-developer'
        return f"https://www.hirist.tech/k/{slug}-jobs?ref=topnavigation"


    async def verify_login(self) -> bool:
        """Check if user is logged in to Hirist."""
        try:
            current_url = await self.browser.get_url()
            if not current_url or 'hirist.tech' not in current_url:
                await self.browser.goto(self.base_url)
                await asyncio.sleep(3)
            
            # Wait for page to load
            await asyncio.sleep(2)
            
            # Check for profile indicators with multiple strategies
            profile_selectors = [
                'a[href*="/candidate/profile"]',
                'a[href*="/profile"]',
                '.user-profile',
                '.user-dropdown',
                'li.dropdown user',
                'a[href*="/my-account"]',
                'button[aria-label*="profile"]',
                '[data-test="user-menu"]'
            ]
            
            self.logger.debug(f"Checking Hirist login at: {await self.browser.get_url()}")
            
            for selector in profile_selectors:
                try:
                    if await self.browser.wait_for_selector(selector, timeout=2000):
                        self.logger.debug(f"✓ Found login indicator: {selector}")
                        return True
                except:
                    continue
            
            # Check if on login page
            current_url = await self.browser.get_url()
            if '/login' in current_url.lower() or '/signin' in current_url.lower():
                self.logger.debug("On login page - not logged in")
                return False
            
            # Check page title as fallback
            title = await self.browser.get_page().title()
            if 'dashboard' in title.lower() or 'profile' in title.lower() or 'my account' in title.lower():
                self.logger.debug(f"✓ Detected login from page title: {title}")
                return True
            
            # If cookies exist, might already be logged in
            cookies = await self.browser.get_context().cookies()
            if any('session' in c.get('name', '').lower() or 'auth' in c.get('name', '').lower() for c in cookies):
                self.logger.debug("✓ Found session cookies, assuming logged in")
                return True
            
            self.logger.debug("No login indicators found")
            return False
        except Exception as e:
            self.logger.debug(f"Error verifying Hirist login: {e}")
            return False
    
    async def login(self) -> bool:
        """Login to Hirist — auto-fills credentials if provided, else waits for manual login."""
        try:
            await self.browser.goto(self.base_url)
            await asyncio.sleep(3)

            if await self.verify_login():
                self.logger.info("✅ Already logged in to Hirist!")
                return True

            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)

            if await self.verify_login():
                self.logger.info("✅ Already logged in to Hirist!")
                return True

            # Auto-fill credentials if provided via wizard
            creds = self.user_preferences.get('credentials', {}).get('hirist', {})
            if creds.get('email') and creds.get('password'):
                self.logger.info("🔑 Auto-filling Hirist credentials...")
                try:
                    page = self.browser.get_page()
                    await page.fill('input[type="email"]', creds['email'])
                    await asyncio.sleep(0.5)
                    await page.fill('input[type="password"]', creds['password'])
                    await asyncio.sleep(0.5)
                    await page.click('button[type="submit"]')
                    await asyncio.sleep(4)
                    if await self.verify_login():
                        self.logger.info("✅ Auto-login to Hirist successful!")
                        return True
                    self.logger.warning("⚠️ Auto-login did not complete, falling back to manual wait...")
                except Exception as e:
                    self.logger.warning(f"Auto-login attempt failed: {e}, falling back to manual...")

            # Manual login fallback
            self.logger.warning("⚠️ Please login to Hirist in the browser window (120 s)...")
            for i in range(24):
                await asyncio.sleep(5)
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)
                    return True

            self.logger.error("❌ Login timeout for Hirist")
            return False
            
        except Exception as e:
            self.logger.error(f"Error during Hirist login: {e}", exc_info=True)
            return False
    
    async def search_jobs(self) -> List[Dict]:
        """Search for jobs on Hirist based on preferences."""
        jobs = []
        
        try:
            # Role-based keyword search built from the user's entered roles.
            search_url = self._build_search_url()

            self.logger.info(f"Searching Hirist: {search_url}")
            await self.browser.goto(search_url)
            await asyncio.sleep(4)
            
            # Wait for page to load completely
            page = self.browser.get_page()
            try:
                await page.wait_for_load_state('networkidle', timeout=15000)
            except:
                pass
            await asyncio.sleep(2)
            
            # Scroll to load more jobs (lazy loading)
            for i in range(self.max_scroll):
                await self.browser.scroll_to_bottom(step=800, max_scrolls=2)
                await asyncio.sleep(3)  # Give time for content to load
            
            # Try multiple selector strategies to find job cards
            job_cards = []
            selectors_to_try = [
                '.job-card',  # Original
                '.card',
                'div[class*="JobCard"]',  # React pattern
                'div[class*="job"]',
                'article[class*="job"]',
                'div[data-testid*="job"]',
                '[class*="job-item"]',
                'article',  # Semantic HTML
            ]
            
            for selector in selectors_to_try:
                job_cards = await self.browser.query_selector_all(selector)
                if job_cards:
                    self.logger.debug(f"Found {len(job_cards)} cards with selector: {selector}")
                    break
            
            self.logger.info(f"Found {len(job_cards)} job cards on Hirist")
            
            # Extract job details from each card
            for card in job_cards[:30]:  # Limit to first 30
                try:
                    job = await self._extract_job_from_card(card)
                    if job and job.get('job_url'):
                        jobs.append(job)
                except Exception as e:
                    self.logger.debug(f"Error extracting job card: {e}")
                    continue
            
        except Exception as e:
            self.logger.error(f"Error searching Hirist jobs: {e}", exc_info=True)
        
        return jobs
    
    async def _extract_job_from_card(self, card) -> Dict:
        """Extract job details from a job card element."""
        try:
            # Job title - try multiple selectors
            title = ''
            for selector in ['.job-title', 'h3', 'h2', '.title', '[class*="title"]', '[class*="role"]']:
                title_elem = await card.query_selector(selector)
                if title_elem:
                    title = await title_elem.inner_text()
                    if title:
                        break
            
            # Company name
            company = ''
            for selector in ['.company', '.company-name', '[class*="company"]', 'span[class*="company"]']:
                company_elem = await card.query_selector(selector)
                if company_elem:
                    company = await company_elem.inner_text()
                    if company:
                        break
            
            # Job URL - check if card itself is a link
            job_url = await card.get_attribute('href')
            if not job_url:
                link_elem = await card.query_selector('a')
                job_url = await link_elem.get_attribute('href') if link_elem else ''
            if job_url and not job_url.startswith('http'):
                job_url = f"https://www.hirist.tech{job_url}"
            
            # Location
            location = ''
            for selector in ['.location', '.loc', '[class*="location"]', '[class*="place"]']:
                location_elem = await card.query_selector(selector)
                if location_elem:
                    location = await location_elem.inner_text()
                    if location:
                        break
            
            # Salary
            salary = ''
            for selector in ['.salary', '.ctc', '[class*="salary"]', '[class*="package"]', '[class*="ctc"]']:
                salary_elem = await card.query_selector(selector)
                if salary_elem:
                    salary = await salary_elem.inner_text()
                    if salary:
                        break
            
            # Description
            description = ''
            for selector in ['.description', '.job-desc', '[class*="description"]', '[class*="detail"]', 'p']:
                desc_elem = await card.query_selector(selector)
                if desc_elem:
                    description = await desc_elem.inner_text()
                    if description:
                        break
            
            return {
                'role': title.strip(),
                'company': company.strip(),
                'job_url': job_url,
                'job_id': job_url.split('/')[-1] if job_url else '',
                'location': location.strip(),
                'salary': salary.strip(),
                'description': description.strip(),
                'portal': 'Hirist'
            }
            
        except Exception as e:
            self.logger.debug(f"Error extracting job details: {e}")
            return {}
    
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a job on Hirist."""
        try:
            # Navigate to job URL with more lenient wait strategy
            self.logger.info(f"Navigating to job: {job['job_url']}")
            
            # Try navigation with domcontentloaded (faster than networkidle)
            page = self.browser.get_page()
            try:
                await page.goto(job['job_url'], wait_until='domcontentloaded', timeout=90000)
                self.logger.info(f"✅ Successfully navigated to Hirist job page")
            except Exception as e:
                self.logger.warning(f"❌ Failed to navigate to job page: {e}")
                return False
            
            await asyncio.sleep(4)  # Give page time to fully render
            
            # VERY aggressive apply button detection
            apply_button = None
            apply_selectors = [
                'button:has-text("Apply")',
                'a:has-text("Apply")',
                'button:has-text("APPLY")',
                'a:has-text("APPLY")',
                '.apply',
                '.apply-btn',
                'button.apply',
                'a.apply',
                '#apply-button',
                '#apply',
                'button[class*="apply"]',
                'a[class*="apply"]',
                'button[type="submit"]',
                'input[type="submit"]',
                '[data-action="apply"]',
            ]
            
            self.logger.debug(f"Searching for apply button with {len(apply_selectors)} selectors...")
            for selector in apply_selectors:
                try:
                    elem = await page.query_selector(selector)
                    if elem:
                        # Check if it's visible
                        is_visible = await elem.is_visible()
                        if is_visible:
                            apply_button = elem
                            self.logger.info(f"✅ Found apply button with selector: {selector}")
                            break
                        else:
                            self.logger.debug(f"Found but not visible: {selector}")
                except Exception as e:
                    self.logger.debug(f"Error checking {selector}: {e}")
                    continue
            
            if not apply_button:
                self.logger.warning(f"❌ Apply button not found for {job['role']} at {job['company']}")
                self.logger.debug(f"Page URL: {await self.browser.get_url()}")
                # Log all buttons on page for debugging
                all_buttons = await page.query_selector_all('button, a[class*="btn"], input[type="submit"]')
                self.logger.debug(f"Found {len(all_buttons)} total buttons/links on page")
                return False
            
            # Click apply button with better timeout handling
            self.logger.info(f"Clicking apply button...")
            try:
                await apply_button.click(timeout=15000)  # Increased from 10s to 15s
            except Exception as e:
                self.logger.error(f"Timeout clicking apply button: {e}")
                # Try one more time
                try:
                    self.logger.info("Retrying apply button click...")
                    await apply_button.click(timeout=10000)
                except:
                    return False
            
            await asyncio.sleep(4)

            # ── Cognitive (LLM-first) completion ──────────────────────────────
            # Hand the open application to the Claude reasoning loop first; it
            # completes arbitrary multi-step / screening layouts generically.
            # None → engine unavailable, fall through to the rule-based filler.
            cog = await self._complete_application_cognitively(
                page, job,
                context_hint=(
                    "The Hirist application form / questionnaire may now be open for "
                    "this job. Complete every step from the profile and submit."
                ),
            )
            if cog is not None:
                return cog

            # Hirist frequently opens a multi-step application form / questionnaire
            # after Apply (screening questions, cover note). Auto-fill and advance
            # it with the shared form-filler instead of leaving it for the user.
            await self._complete_followup_modal(
                page,
                container_selectors=[
                    '[role="dialog"]', '.modal', '.modal-content', 'form',
                    'div[class*="apply"]', 'div[class*="application"]',
                    'div[class*="question"]',
                ],
                advance_selectors=[
                    'button:has-text("Submit")', 'button:has-text("Continue")',
                    'button:has-text("Next")', 'button:has-text("Save")',
                    'button:has-text("Apply")', 'button[type="submit"]',
                ],
                success_selectors=[
                    'text=Applied', 'text=Successfully Applied',
                    'text=Application Submitted', 'text=Thank you',
                ],
                job=job,
            )

            # Look for immediate confirmation indicators
            success_indicators = [
                'text=Applied',
                'text=Application Submitted',
                '.success',
                '.applied',
                '[class*="success"]',
                'text=Thank you',
                'text=Successfully Applied',
            ]

            immediate_confirmation = False
            for selector in success_indicators:
                try:
                    elem = await page.query_selector(selector)
                    if elem:
                        self.logger.info(f"✅ Application successful - found: {selector}")
                        immediate_confirmation = True
                        break
                except:
                    continue
            
            # ALWAYS VERIFY: Wait 5 seconds and check button state (TRUSTWORTHY CHECK)
            self.logger.info("⏳ Verifying application - waiting 5 seconds...")
            await asyncio.sleep(5)
            
            # Reload the page to verify
            applied = False
            try:
                await page.reload(wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(3)
                
                # Check if button now shows "Applied" instead of "Apply"
                applied_button = None
                applied_selectors = [
                    'button:has-text("Applied")',
                    'a:has-text("Applied")',
                    '[class*="applied"]',
                ]
                
                for selector in applied_selectors:
                    try:
                        elem = await page.query_selector(selector)
                        if elem:
                            applied_button = elem
                            text = await elem.inner_text()
                            self.logger.info(f"✅✅ VERIFIED: Button now shows '{text}'")
                            applied = True
                            break
                    except:
                        continue
                
                if not applied_button:
                    # Check if Apply button is gone/disabled
                    apply_btn_check = await page.query_selector('button:has-text("Apply")')
                    if apply_btn_check:
                        self.logger.warning("⚠️ VERIFICATION FAILED: Apply button still visible")
                        applied = False
                    else:
                        self.logger.info("✅ VERIFIED: Apply button is gone - application successful")
                        applied = True
                        
            except Exception as e:
                self.logger.warning(f"⚠️ Could not verify application status: {e}")
                # If verification failed, consider it applied if we saw immediate confirmation
                applied = immediate_confirmation
            
            return applied
            
        except Exception as e:
            self.logger.error(f"Error applying to job on Hirist: {e}", exc_info=True)
            return False


if __name__ == "__main__":
    print("Hirist portal implementation ready")
