"""
Naukri.com Portal Implementation
"""

from typing import Dict, List
import asyncio
from .base_portal import BasePortal


class NaukriPortal(BasePortal):
    """Naukri.com job portal implementation."""
    
    async def verify_login(self) -> bool:
        """Check if user is logged in to Naukri."""
        try:
            # Naukri shows profile/account link when logged in
            await self.browser.goto(self.base_url)
            await asyncio.sleep(2)
            
            # Check for profile/logout indicators
            profile_selectors = [
                'a[title="My Naukri"]',
                '.nI-gNb-info-icon',
                '.nI-gNb-drawer__icon',
                'div.nI-gNb-info'
            ]
            
            for selector in profile_selectors:
                if await self.browser.wait_for_selector(selector, timeout=3000):
                    return True
            
            return False
        except Exception as e:
            self.logger.debug(f"Error verifying Naukri login: {e}")
            return False
    
    async def login(self) -> bool:
        """Login to Naukri — auto-fills credentials if provided, else waits for manual login."""
        try:
            await self.browser.goto(self.login_url)
            await asyncio.sleep(2)

            if await self.verify_login():
                return True

            # Auto-fill credentials if provided via wizard
            creds = self.user_preferences.get('credentials', {}).get('naukri', {})
            if creds.get('email') and creds.get('password'):
                self.logger.info("🔑 Auto-filling Naukri credentials...")
                try:
                    page = self.browser.get_page()
                    await page.fill('input[placeholder*="Email"]', creds['email'])
                    await asyncio.sleep(0.5)
                    await page.fill('input[type="password"]', creds['password'])
                    await asyncio.sleep(0.5)
                    await page.click('button[type="submit"]')
                    await asyncio.sleep(3)
                    if await self.verify_login():
                        self.logger.info("✅ Auto-login to Naukri successful!")
                        return True
                    self.logger.warning("⚠️ Auto-login did not complete, falling back to manual wait...")
                except Exception as e:
                    self.logger.warning(f"Auto-login attempt failed: {e}, falling back to manual...")

            # Manual login fallback
            self.logger.warning("⚠️ Please login to Naukri.com in the browser window (120 s)...")
            for i in range(24):
                await asyncio.sleep(5)
                if await self.verify_login():
                    self.logger.info("✅ Login detected!")
                    return True

            self.logger.error("Login timeout for Naukri")
            return False

        except Exception as e:
            self.logger.error(f"Error during Naukri login: {e}", exc_info=True)
            return False
    
    async def search_jobs(self) -> List[Dict]:
        """Search for jobs on Naukri based on preferences.
        
        NOTE: Naukri workflow changed to checkbox-based:
        - No need to extract URLs
        - Just get titles and card indexes for matching
        """
        jobs = []
        
        try:
            # Use RECOMMENDED jobs page - shows jobs based on your profile!
            search_url = "https://www.naukri.com/mnjuser/recommendedjobs"
            
            self.logger.info(f"Searching Naukri: {search_url}")
            await self.browser.goto(search_url)
            await asyncio.sleep(3)
            
            # Scroll to load more jobs
            for _ in range(self.max_scroll):
                await self.browser.scroll_to_bottom(step=800, max_scrolls=2)
                await asyncio.sleep(2)
            
            # Get all job cards - try multiple selectors for recommended jobs page
            page = self.browser.get_page()
            job_cards = []
            selectors_to_try = [
                'article.jobTuple',  # Recommended jobs
                '.srp-jobtuple-wrapper',  # Search results page
                'div.jobTuple',
                '[class*="jobTuple"]',
                'article',
            ]
            
            for selector in selectors_to_try:
                job_cards = await page.query_selector_all(selector)
                if job_cards and len(job_cards) > 0:
                    self.logger.debug(f"Found cards with selector: {selector}")
                    break
            
            self.logger.info(f"Found {len(job_cards)} job cards on Naukri")
            
            # Extract just title and company for matching (no URL needed!)
            for idx, card in enumerate(job_cards[:30]):  # Limit to first 30
                try:
                    # Get title
                    title = ''
                    for selector in ['.title', 'a.title', 'h2', 'h3', '[class*="title"]']:
                        title_elem = await card.query_selector(selector)
                        if title_elem:
                            title = await title_elem.inner_text()
                            if title and len(title.strip()) > 2:
                                break
                    
                    # Get company
                    company = ''
                    for selector in ['.comp-name', '.company', '[class*="company"]']:
                        company_elem = await card.query_selector(selector)
                        if company_elem:
                            company = await company_elem.inner_text()
                            if company:
                                break
                    
                    if title:
                        jobs.append({
                            'role': title.strip(),
                            'company': company.strip(),
                            # Unique per card so dedup / DB / approval don't collide
                            # (the recommended-jobs URL is shared by every card).
                            'job_url': f'{search_url}#card{idx}',
                            'job_id': f'naukri_{idx}',
                            'card_index': idx,  # Track which card to use
                            'portal': 'Naukri.com'
                        })
                except Exception as e:
                    self.logger.debug(f"Error extracting job card: {e}")
                    continue
            
        except Exception as e:
            self.logger.error(f"Error searching Naukri jobs: {e}", exc_info=True)
        
        return jobs
    
    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """Naukri recommended-jobs checkbox flow: the page reloads after each
        apply, so use the shared single-page loop (search → next unseen match →
        select checkbox → "Apply 1 Job" → repeat).

        Per-job mechanics live in `search_jobs` (unique `job_url` per card) and
        `apply_to_job` (checkbox + "Apply 1 Job" button).
        """
        return await self._process_single_page(max_applications, dry_run)
    
    async def _extract_job_from_card(self, card) -> Dict:
        """Extract job details from a job card element."""
        try:
            # Job title - try multiple selectors
            title = ''
            for selector in ['.title', 'a.title', 'h2', 'h3', '[class*="title"]', 'a']:
                title_elem = await card.query_selector(selector)
                if title_elem:
                    title = await title_elem.inner_text()
                    if title and len(title.strip()) > 2:
                        break
            
            # Company name - flexible selectors
            company = ''
            for selector in ['.comp-name', '.company', '[class*="company"]', 'span[class*="comp"]']:
                company_elem = await card.query_selector(selector)
                if company_elem:
                    company = await company_elem.inner_text()
                    if company:
                        break
            
            # Job URL - CRITICAL: Get job link, NOT Ambitionbox review link!
            job_url = ''
            
            # DEBUG: Get ALL links in the card to see what we have
            all_links = await card.query_selector_all('a')
            self.logger.info(f"\n===== JOB CARD: {title[:50]} =====")
            self.logger.info(f"Found {len(all_links)} total links in card")
            
            for i, link in enumerate(all_links):
                href = await link.get_attribute('href')
                link_text = (await link.inner_text()).strip()[:30]
                link_class = await link.get_attribute('class')
                self.logger.info(f"  Link {i}: text='{link_text}' class='{link_class}' href='{href[:80] if href else None}'")
            
            # Try to find the job title link specifically (NOT company review link)
            title_link_selectors = [
                'a.title',  # Most common - job title link
                '.title a',
                'a[class*="title"]',
                'h2 a',
                'h3 a',
                'a[href*="job-listings"]',
                'a[href*="/job-"]',
            ]
            
            for selector in title_link_selectors:
                try:
                    link_elem = await card.query_selector(selector)
                    if link_elem:
                        href = await link_elem.get_attribute('href')
                        # SKIP Ambitionbox and external links
                        if href:
                            if 'ambitionbox' in href.lower():
                                self.logger.info(f"  ⚠️ Skipping Ambitionbox link: {href[:80]}")
                                continue
                            if 'naukri.com' in href or href.startswith('/'):
                                job_url = href
                                self.logger.info(f"  ✅ Found job URL with {selector}: {href[:80]}")
                                break
                except Exception as e:
                    self.logger.info(f"  Error checking {selector}: {e}")
                    continue
            
            # If still not found, look for any link that looks like a job
            if not job_url:
                self.logger.info("  Trying fallback: checking all links for job indicators...")
                for link in all_links:
                    href = await link.get_attribute('href')
                    if href:
                        # SKIP Ambitionbox, external sites, etc.
                        if 'ambitionbox' in href.lower():
                            self.logger.info(f"    ❌ Skipping Ambitionbox: {href[:60]}")
                            continue
                        if 'reviews' in href.lower():
                            self.logger.info(f"    ❌ Skipping reviews link: {href[:60]}")
                            continue
                        # Look for job indicators
                        if any(indicator in href.lower() for indicator in ['job-listings', '/job-', 'jobid=', 'jid=']):
                            job_url = href
                            self.logger.info(f"  ✅ Found job URL in fallback: {href[:80]}")
                            break
            
            if job_url and not job_url.startswith('http'):
                job_url = f"https://www.naukri.com{job_url}"
            
            # Skip if no valid job URL found (likely got Ambitionbox link)
            if not job_url or 'ambitionbox' in job_url.lower():
                self.logger.warning(f"❌ No valid job URL found for: {title[:50]}")
                self.logger.info("All links were either Ambitionbox or non-job links")
                return {}
            
            # Location - flexible
            location = ''
            for selector in ['.loc-wrap', '.location', '[class*="location"]', '[class*="loc"]']:
                location_elem = await card.query_selector(selector)
                if location_elem:
                    location = await location_elem.inner_text()
                    if location:
                        break
            
            # Salary - flexible
            salary = ''
            for selector in ['.sal-wrap', '.salary', '[class*="salary"]', '[class*="sal"]']:
                salary_elem = await card.query_selector(selector)
                if salary_elem:
                    salary = await salary_elem.inner_text()
                    if salary:
                        break
            
            # Experience - flexible
            experience = ''
            for selector in ['.exp-wrap', '.experience', '[class*="experience"]', '[class*="exp"]']:
                exp_elem = await card.query_selector(selector)
                if exp_elem:
                    experience = await exp_elem.inner_text()
                    if experience:
                        break
            
            # Job description snippet
            description = ''
            for selector in ['.job-desc', '.description', '[class*="desc"]', 'p']:
                desc_elem = await card.query_selector(selector)
                if desc_elem:
                    description = await desc_elem.inner_text()
                    if description:
                        break
            
            # Check if Easy Apply available
            easy_apply = await card.query_selector('.apply-button') is not None or await card.query_selector('button:has-text("Apply")') is not None
            
            return {
                'role': title.strip(),
                'company': company.strip(),
                'job_url': job_url,
                'job_id': job_url.split('/')[-1] if job_url else '',
                'location': location.strip(),
                'salary': salary.strip(),
                'experience': experience.strip(),
                'description': description.strip(),
                'easy_apply': easy_apply,
                'portal': 'Naukri'
            }
            
        except Exception as e:
            self.logger.debug(f"Error extracting job details: {e}")
            return {}
    
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a job on Naukri using checkbox workflow.
        
        NEW WORKFLOW:
        1. Find checkbox on left of job card (by card_index)
        2. Click checkbox
        3. Wait for "Apply 1 Job" button to appear on right side
        4. Click "Apply 1 Job" button
        5. Wait for redirect to confirmation page
        6. Navigate back to recommended jobs page
        """
        try:
            page = self.browser.get_page()
            card_index = job.get('card_index', 0)
            
            self.logger.info(f"Processing Naukri job card #{card_index}: {job['role']}")
            
            # Make sure we're on recommended jobs page
            current_url = await self.browser.get_url()
            if 'recommendedjobs' not in current_url:
                self.logger.info("Navigating to Naukri recommended jobs page...")
                await self.browser.goto("https://www.naukri.com/mnjuser/recommendedjobs")
                await asyncio.sleep(3)
            
            # Re-fetch job cards to ensure fresh state
            await asyncio.sleep(2)
            job_cards = []
            selectors_to_try = [
                'article.jobTuple',
                '.srp-jobtuple-wrapper',
                'div.jobTuple',
                '[class*="jobTuple"]',
            ]
            
            for selector in selectors_to_try:
                job_cards = await page.query_selector_all(selector)
                if job_cards and len(job_cards) > 0:
                    break
            
            self.logger.debug(f"Found {len(job_cards)} cards on page")

            # Re-locate by title (stable) rather than positional index.
            card = await self._relocate_card(job_cards, job)
            if card is None:
                self.logger.warning(
                    f"Could not re-locate card for '{job.get('role')}' (have {len(job_cards)} cards)"
                )
                return False
            
            # Find checkbox on LEFT side of job card
            checkbox = None
            checkbox_selectors = [
                'input[type="checkbox"]',
                '.checkbox',
                '[class*="checkbox"]',
                'input[class*="select"]',
                '[type="checkbox"]',
            ]
            
            self.logger.debug("Looking for checkbox in job card...")
            for selector in checkbox_selectors:
                try:
                    checkbox = await card.query_selector(selector)
                    if checkbox:
                        is_visible = await checkbox.is_visible()
                        if is_visible:
                            self.logger.info(f"✅ Found checkbox: {selector}")
                            break
                        else:
                            # Try to get parent that might be clickable
                            parent = await checkbox.evaluate_handle('el => el.parentElement')
                            if parent:
                                checkbox = parent.as_element()
                                break
                except Exception as e:
                    self.logger.debug(f"Error checking {selector}: {e}")
                    continue
            
            if not checkbox:
                self.logger.warning(f"Checkbox not found on card {card_index}")
                # Try to scroll card into view and retry
                try:
                    await card.scroll_into_view_if_needed()
                    await asyncio.sleep(1)
                    # Retry
                    for selector in checkbox_selectors:
                        checkbox = await card.query_selector(selector)
                        if checkbox:
                            break
                except:
                    pass
                    
                if not checkbox:
                    self.logger.warning(f"Still no checkbox found for {job['role']}")
                    return False
            
            # Click checkbox
            self.logger.info("Clicking checkbox to select job...")
            try:
                await checkbox.click(timeout=10000)
                await asyncio.sleep(2)  # Wait for button to enable
            except Exception as e:
                self.logger.error(f"Failed to click checkbox: {e}")
                # Try clicking the parent element
                try:
                    parent = await checkbox.evaluate_handle('el => el.closest("label") || el.parentElement')
                    if parent:
                        await parent.as_element().click()
                        await asyncio.sleep(2)
                except:
                    return False
            
            # Find "Apply 1 Job" button (on RIGHT side of page, NOT in card!)
            apply_button = None
            apply_button_selectors = [
                'button:has-text("Apply")',
                'button:has-text("Apply 1 Job")',
                'button[class*="apply"]',
                '.apply-button',
                '[class*="apply-btn"]',
                'button:has-text("Apply to")',
            ]
            
            self.logger.debug("Looking for 'Apply 1 Job' button on page...")
            for selector in apply_button_selectors:
                try:
                    apply_button = await page.query_selector(selector)
                    if apply_button:
                        is_visible = await apply_button.is_visible()
                        is_enabled = await apply_button.is_enabled()
                        if is_visible and is_enabled:
                            button_text = await apply_button.inner_text()
                            self.logger.info(f"✅ Found apply button: '{button_text}' with {selector}")
                            break
                except Exception as e:
                    self.logger.debug(f"Error checking {selector}: {e}")
                    continue
            
            if not apply_button:
                self.logger.warning(f"'Apply 1 Job' button not found or not enabled")
                # Log all visible buttons for debugging
                all_buttons = await page.query_selector_all('button:visible')
                self.logger.debug(f"Found {len(all_buttons)} visible buttons on page")
                return False
            
            # Click "Apply 1 Job" button
            self.logger.info(f"Clicking 'Apply 1 Job' button for: {job['role']}")
            try:
                await apply_button.click(timeout=10000)
            except Exception as e:
                self.logger.error(f"Failed to click Apply button: {e}")
                return False
            
            # Wait for redirect to confirmation page
            self.logger.info("⏳ Waiting for confirmation page...")
            await asyncio.sleep(5)

            # Many Naukri jobs open a follow-up questionnaire (the "chatbot"
            # drawer or a modal) that must be answered before the application is
            # recorded. Auto-answer it with the shared form-filler.
            await self._complete_followup_modal(
                page,
                container_selectors=[
                    '.chatbot_DrawerContentWrapper', 'div[class*="chatbot"]',
                    '.chatbot_Drawer', '.drawer', '[role="dialog"]',
                    '.apply-message-modal', 'div[class*="Drawer"]',
                ],
                advance_selectors=[
                    'button:has-text("Save")', 'button:has-text("Submit")',
                    'button:has-text("Continue")', 'button:has-text("Apply")',
                    '.sendMsg', '[class*="sendMsg"]', 'div[class*="send"]',
                ],
                success_selectors=[
                    'text=successfully applied', 'text=Successfully Applied',
                    'text=Application sent', 'text=You have successfully applied',
                ],
                max_rounds=8,
                job=job,
            )

            # Check for confirmation message
            confirmation_found = False
            confirmation_selectors = [
                'text=Applied',
                'text=Application Submitted',
                'text=Successfully Applied',
                '.success',
                '[class*="success"]',
                'text=Thank you',
            ]
            
            for selector in confirmation_selectors:
                try:
                    elem = await page.query_selector(selector)
                    if elem:
                        self.logger.info(f"✅ Application confirmed: {selector}")
                        confirmation_found = True
                        break
                except:
                    continue
            
            # Navigate back to recommended jobs page for next iteration
            self.logger.info("Navigating back to recommended jobs page...")
            await self.browser.goto("https://www.naukri.com/mnjuser/recommendedjobs")
            await asyncio.sleep(2)

            # Honest result: only count as applied when a confirmation marker was
            # seen (so a silent failure is retried/marked FAILED, not faked).
            return confirmation_found
            
        except Exception as e:
            self.logger.error(f"Error applying to Naukri job: {e}", exc_info=True)
            # Try to navigate back to recommended page even on error
            try:
                await self.browser.goto("https://www.naukri.com/mnjuser/recommendedjobs")
                await asyncio.sleep(2)
            except:
                pass
            return False


if __name__ == "__main__":
    print("Naukri portal implementation ready")
