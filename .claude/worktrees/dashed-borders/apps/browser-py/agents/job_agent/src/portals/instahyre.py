"""
Instahyre Portal Implementation
"""

from typing import Dict, List
import asyncio
from .base_portal import BasePortal


class InstahyrePortal(BasePortal):
    """Instahyre job portal implementation."""
    
    async def verify_login(self) -> bool:
        """Check if user is logged in to Instahyre."""
        try:
            current_url = await self.browser.get_url()
            if not current_url or 'instahyre.com' not in current_url:
                await self.browser.goto(self.base_url)
                await asyncio.sleep(3)
            
            # Wait for page to load completely
            await asyncio.sleep(2)
            
            # Check for profile/dashboard indicators with multiple strategies
            profile_selectors = [
                'a[href*="/candidate/profile"]',
                'a[href*="/profile"]',
                '.user-menu',
                '.user-dropdown',
                'nav .dropdown',
                'button[aria-label*="profile"]',
                'a[href*="/dashboard"]',
                '[data-testid="user-menu"]'
            ]
            
            self.logger.debug(f"Checking login state at: {await self.browser.get_url()}")
            
            for selector in profile_selectors:
                try:
                    if await self.browser.wait_for_selector(selector, timeout=2000):
                        self.logger.debug(f"✓ Found login indicator: {selector}")
                        return True
                except:
                    continue
            
            # Also check if we're redirected to login page
            current_url = await self.browser.get_url()
            if '/login' in current_url.lower() or '/signin' in current_url.lower():
                self.logger.debug("On login page - not logged in")
                return False
            
            # Check page title as fallback
            title = await self.browser.get_page().title()
            if 'dashboard' in title.lower() or 'profile' in title.lower():
                self.logger.debug(f"✓ Detected login from page title: {title}")
                return True
            
            self.logger.debug("No login indicators found")
            return False
        except Exception as e:
            self.logger.debug(f"Error verifying Instahyre login: {e}")
            return False
    
    async def login(self) -> bool:
        """Login to Instahyre — auto-fills credentials if provided, else waits for manual login."""
        try:
            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)

            if await self.verify_login():
                self.logger.info("✅ Already logged in to Instahyre!")
                return True

            # Auto-fill credentials if provided via wizard
            creds = self.user_preferences.get('credentials', {}).get('instahyre', {})
            if creds.get('email') and creds.get('password'):
                self.logger.info("🔑 Auto-filling Instahyre credentials...")
                try:
                    page = self.browser.get_page()
                    await page.fill('input[type="email"]', creds['email'])
                    await asyncio.sleep(0.5)
                    await page.fill('input[type="password"]', creds['password'])
                    await asyncio.sleep(0.5)
                    await page.click('button[type="submit"]')
                    await asyncio.sleep(4)
                    if await self.verify_login():
                        self.logger.info("✅ Auto-login to Instahyre successful!")
                        return True
                    self.logger.warning("⚠️ Auto-login did not complete, falling back to manual wait...")
                except Exception as e:
                    self.logger.warning(f"Auto-login attempt failed: {e}, falling back to manual...")

            # Manual login fallback
            self.logger.warning("⚠️ Please login to Instahyre in the browser window (120 s)...")
            for i in range(24):
                await asyncio.sleep(5)
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)
                    return True

            self.logger.error("❌ Login timeout")
            return False

        except Exception as e:
            self.logger.error(f"Error during Instahyre login: {e}", exc_info=True)
            return False
    
    async def search_jobs(self) -> List[Dict]:
        """Search for jobs on Instahyre based on preferences.
        
        NOTE: Instahyre shows jobs as cards with View buttons that open popups.
        Jobs don't have individual URLs - they open in overlays on the same page.
        """
        jobs = []
        
        try:
            # Use MATCHING jobs page - shows jobs that match user's profile!
            search_url = "https://www.instahyre.com/candidate/opportunities/?matching=true"
            self.logger.info(f"Searching Instahyre: {search_url}")
            
            await self.browser.goto(search_url)
            await asyncio.sleep(5)  # Wait for initial page load
            
            # Wait for page to load completely
            page = self.browser.get_page()
            try:
                await page.wait_for_load_state('networkidle', timeout=15000)
            except:
                pass
            
            # AngularJS needs extra time to render ng-repeat elements
            await asyncio.sleep(3)
            
            # Wait specifically for AngularJS elements to appear
            self.logger.debug("Waiting for AngularJS to render job cards...")
            try:
                await page.wait_for_selector('div[ng-repeat]', timeout=10000)
                self.logger.debug("AngularJS elements detected!")
            except:
                self.logger.warning("Timeout waiting for ng-repeat elements")
            
            # Scroll to load more jobs (lazy loading)
            for i in range(self.max_scroll):
                await self.browser.scroll_to_bottom(step=800, max_scrolls=2)
                await asyncio.sleep(2)
            
            # Try multiple selector strategies to find job cards
            # Instahyre uses AngularJS with ng-repeat directives
            job_cards = []
            selectors_to_try = [
                'div[ng-repeat]',  # AngularJS repeat - WORKS!
                '.opportunity-card',
                'div[class*="job-card"]',
                'article',
                'a[href*="/job/"]',
            ]
            
            for selector in selectors_to_try:
                job_cards = await self.browser.query_selector_all(selector)
                if job_cards and len(job_cards) > 0:
                    self.logger.debug(f"Found {len(job_cards)} cards with selector: {selector}")
                    break
            
            self.logger.info(f"Found {len(job_cards)} job cards on Instahyre")
            
            # Extract job titles from each card (NO URLs - they use popups!)
            for card in job_cards[:30]:  # Limit to first 30
                try:
                    # Just extract title and company for matching
                    title = await self._extract_title_from_card(card)
                    if title:
                        # Card index doubles as the dedup key — jobs open in a
                        # popup, so there's no per-job URL to use.
                        idx = len(jobs)
                        jobs.append({
                            'role': title,
                            'company': '',  # We'll get this from popup
                            'job_url': f'{search_url}#card{idx}',  # unique per card
                            'job_id': f'instahyre_{idx}',
                            'card_index': idx,  # Track which card to click
                            'portal': 'Instahyre'
                        })
                except Exception as e:
                    self.logger.debug(f"Error extracting job card: {e}")
                    continue
            
        except Exception as e:
            self.logger.error(f"Error searching Instahyre jobs: {e}", exc_info=True)
        
        return jobs
    
    async def _extract_title_from_card(self, card) -> str:
        """Extract just the title from a job card."""
        try:
            full_text = await card.inner_text()
            lines = [l.strip() for l in full_text.split('\n') if l.strip()]
            if lines:
                # First line is usually: "Company - Job Title"
                return lines[0]
            return ''
        except:
            return ''
    
    async def process(self, max_applications: int = 5, dry_run: bool = False) -> int:
        """Instahyre matching-jobs popup flow: the page reloads after each apply,
        so use the shared single-page loop (search → next unseen match → View →
        Apply in popup → repeat).

        Per-job mechanics live in `search_jobs` (unique `job_url` per card) and
        `apply_to_job` (View button → Apply in popup).
        """
        return await self._process_single_page(max_applications, dry_run)
    
    async def _extract_job_from_card(self, card) -> Dict:
        """Extract job details from a job card element."""
        try:
            # Get full text content for debugging
            full_text = await card.inner_text()
            
            # Job title - VERY aggressive extraction
            title = ''
            # First try structured selectors
            for selector in ['.employer-job-name', '.opportunity-title', '.job-title', 'h1', 'h2', 'h3', 'h4', '[class*="title"]', 'strong', 'b']:
                title_elem = await card.query_selector(selector)
                if title_elem:
                    title = await title_elem.inner_text()
                    if title and len(title.strip()) > 3:
                        break
            
            # If no title found, extract first line of text (fallback)
            if not title or len(title.strip()) < 3:
                lines = [l.strip() for l in full_text.split('\n') if l.strip()]
                if lines:
                    title = lines[0]  # First non-empty line is usually the title
            
            # Company name (AngularJS specific classes)
            company = ''
            for selector in ['.employer-name', '.company-name', '[class*="employer"]', '[class*="company"]', 'span', 'div']:
                company_elem = await card.query_selector(selector)
                if company_elem:
                    company = await company_elem.inner_text()
                    if company and len(company.strip()) > 2 and company != title:
                        break
            
            # Job URL - MUCH more aggressive extraction
            job_url = ''
            
            # Method 1: Card itself is a link
            job_url = await card.get_attribute('href')
            
            # Method 2: Find ALL links and use first one that looks like a job URL
            if not job_url:
                all_links = await card.query_selector_all('a')
                for link in all_links:
                    href = await link.get_attribute('href')
                    if href:
                        # Accept any link - be very permissive
                        if ('/job/' in href or '/opportunity/' in href or 'instahyre.com' in href or href.startswith('/')):
                            job_url = href
                            self.logger.debug(f"Found URL in link: {href}")
                            break
                # If still nothing, just use first link's href
                if not job_url and all_links:
                    first_href = await all_links[0].get_attribute('href')
                    if first_href:
                        job_url = first_href
                        self.logger.debug(f"Using first link: {first_href}")
            
            # Method 3: Look for data-* attributes
            if not job_url:
                for attr in ['data-url', 'data-href', 'data-link', 'data-job-url']:
                    url = await card.get_attribute(attr)
                    if url:
                        job_url = url
                        self.logger.debug(f"Found URL in {attr}: {url}")
                        break
            
            # Method 4: Look for onclick or other event handlers
            if not job_url:
                onclick = await card.get_attribute('onclick')
                if onclick and 'job' in onclick.lower():
                    # Try to extract URL from onclick - simple string search
                    if '/job/' in onclick:
                        start = onclick.find('/job/')
                        # Find the end (next quote or space)
                        end = start + 5
                        while end < len(onclick) and onclick[end] not in ['"', "'", ' ', ')']:
                            end += 1
                        job_url = onclick[start:end]
                        self.logger.debug(f"Extracted URL from onclick: {job_url}")
            
            # Method 5: Try ng-click or other Angular attributes
            if not job_url:
                ng_click = await card.get_attribute('ng-click')
                if ng_click:
                    self.logger.debug(f"Found ng-click: {ng_click}")
                    # Angular might use IDs - try to construct URL
                    import re
                    id_match = re.search(r'\\d+', ng_click)
                    if id_match:
                        job_id = id_match.group()
                        job_url = f"/job/{job_id}"
                        self.logger.debug(f"Constructed URL from ng-click: {job_url}")
                
            # Log if URL not found for debugging
            if not job_url:
                card_html = await card.inner_html()
                self.logger.info(f"⚠️ No URL found in Instahyre card. Title: '{title[:50] if title else 'NO TITLE'}', Full text: '{full_text[:100]}'")
                self.logger.debug(f"HTML preview: {card_html[:500]}")
                # DON'T skip - continue with extraction for debugging
                
            # Ensure full URL
            if job_url:
                if not job_url.startswith('http'):
                    job_url = f"https://www.instahyre.com{job_url}"
                self.logger.info(f"✅ Extracted Instahyre job: {title[:50]} -> {job_url}")
            else:
                # For debugging, still create job entry but mark URL as missing
                self.logger.warning(f"❌ Instahyre job has no URL, skipping: {title[:50]}")
                return {}
            
            # Location
            location = ''
            for selector in ['.location', '[class*="location"]', '[class*="city"]']:
                location_elem = await card.query_selector(selector)
                if location_elem:
                    location = await location_elem.inner_text()
                    if location:
                        break
            
            # Salary
            salary = ''
            for selector in ['.salary', '.ctc', '[class*="salary"]', '[class*="ctc"]', '[class*="compensation"]']:
                salary_elem = await card.query_selector(selector)
                if salary_elem:
                    salary = await salary_elem.inner_text()
                    if salary:
                        break
            
            # Description
            description = ''
            for selector in ['.description', '.job-description', '[class*="description"]', '[class*="detail"]', 'p']:
                desc_elem = await card.query_selector(selector)
                if desc_elem:
                    description = await desc_elem.inner_text()
                    if description:
                        break
            
            job_data = {
                'role': title.strip(),
                'company': company.strip(),
                'job_url': job_url,
                'job_id': job_url.split('/')[-1] if job_url else '',
                'location': location.strip(),
                'salary': salary.strip(),
                'description': description.strip(),
                'portal': 'Instahyre'
            }
            
            # Log successful extraction for debugging
            self.logger.debug(f"Extracted: {job_data['role']} at {job_data['company']} - {job_data['job_url'][:50]}")
            
            return job_data
            
        except Exception as e:
            self.logger.debug(f"Error extracting job details: {e}")
            return {}
    
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a job on Instahyre.
        
        Instahyre workflow:
        1. All jobs are on matching page
        2. Click "View" button on job card to open popup
        3. Click "Apply" in the popup
        4. Wait for confirmation
        5. Close popup and return to main page for next job
        """
        try:
            page = self.browser.get_page()
            card_index = job.get('card_index', 0)
            
            self.logger.info(f"Processing Instahyre job card #{card_index}: {job['role']}")
            
            # Make sure we're on the matching jobs page
            current_url = await self.browser.get_url()
            if 'opportunities' not in current_url:
                self.logger.info("Navigating back to Instahyre matching jobs page...")
                await self.browser.goto("https://www.instahyre.com/candidate/opportunities/?matching=true")
                await asyncio.sleep(3)
            
            # CRITICAL: Re-fetch job cards to ensure fresh state
            await asyncio.sleep(2)  # Let page settle
            job_cards = await page.query_selector_all('div[ng-repeat]')
            self.logger.debug(f"Found {len(job_cards)} cards on page")

            # Re-locate by title (stable) rather than positional index.
            card = await self._relocate_card(job_cards, job)
            if card is None:
                self.logger.warning(
                    f"Could not re-locate card for '{job.get('role')}' (have {len(job_cards)} cards)"
                )
                return False
            
            # Look for "View" button on the card
            view_button = None
            view_selectors = [
                'button:has-text("View")',
                'a:has-text("View")',
                '.view-btn',
                'button[class*="view"]',
            ]
            
            for selector in view_selectors:
                try:
                    view_button = await card.query_selector(selector)
                    if view_button:
                        is_visible = await view_button.is_visible()
                        if is_visible:
                            self.logger.info(f"✅ Found View button: {selector}")
                            break
                except:
                    continue
            
            if not view_button:
                self.logger.warning(f"View button not found on card {card_index}")
                return False
            
            # Click View button to open popup
            self.logger.info("Clicking View button to open job details...")
            try:
                await view_button.click(timeout=10000)
            except Exception as e:
                self.logger.error(f"Failed to click View button: {e}")
                return False
                
            await asyncio.sleep(3)  # Wait for popup to appear
            
            # Look for Apply button (search whole page, not just popup)
            apply_button = None
            apply_selectors = [
                'button:has-text("Apply")',
                'a:has-text("Apply")',
                '.apply-btn',
                'button.apply',
                'button[class*="apply"]',
            ]
            
            for selector in apply_selectors:
                try:
                    apply_button = await page.query_selector(selector)
                    if apply_button:
                        is_visible = await apply_button.is_visible()
                        if is_visible:
                            self.logger.info(f"✅ Found Apply button: {selector}")
                            break
                except:
                    continue
            
            if not apply_button:
                self.logger.warning(f"Apply button not found for {job['role']}")
                # Try to close any popup
                try:
                    close_btn = await page.query_selector('[class*="close"], button:has-text("Close"), [aria-label="Close"]')
                    if close_btn:
                        await close_btn.click()
                        await asyncio.sleep(1)
                except:
                    pass
                return False
            
            # Click Apply button
            self.logger.info(f"Clicking Apply button for: {job['role']}")
            try:
                await apply_button.click(timeout=10000)
            except Exception as e:
                self.logger.error(f"Failed to click Apply button: {e}")
                return False

            await asyncio.sleep(3)

            # Some Instahyre roles show a follow-up form / questions in the popup
            # before the application is confirmed. Auto-answer it with the shared
            # form-filler (no-op when apply is a single click).
            await self._complete_followup_modal(
                page,
                container_selectors=[
                    '.modal-content', '.modal-dialog', '[role="dialog"]',
                    'div[class*="modal"]', '.popup', '.ngdialog-content',
                ],
                advance_selectors=[
                    'button:has-text("Apply")', 'button:has-text("Submit")',
                    'button:has-text("Confirm")', 'button:has-text("Send")',
                    'button:has-text("Continue")',
                ],
                success_selectors=[
                    'text=Application Submitted', 'text=Successfully Applied',
                    'text=You have applied',
                ],
                max_rounds=4,
                job=job,
            )

            # Check for confirmation
            success_indicators = [
                'text=Applied',
                'text=Application Submitted',
                '.success',
                '.applied',
                '[class*="success"]',
            ]
            
            applied = False
            for selector in success_indicators:
                try:
                    elem = await page.query_selector(selector)
                    if elem:
                        self.logger.info(f"✅ Application confirmed: {selector}")
                        applied = True
                        break
                except:
                    continue
            
            if not applied:
                # Check if Apply button changed to "Applied"
                try:
                    button_text = await apply_button.inner_text()
                    if 'applied' in button_text.lower():
                        self.logger.info("✅ Button shows 'Applied'")
                        applied = True
                except:
                    pass
            
            # IMPORTANT: Close popup/modal before moving to next job
            # This ensures we return to the main listing page
            await asyncio.sleep(2)
            try:
                # Try to close popup by clicking close button or ESC key
                close_selectors = [
                    '[class*="close"]',
                    'button:has-text("Close")',
                    '[aria-label="Close"]',
                    '.modal-close',
                ]
                for sel in close_selectors:
                    close_btn = await page.query_selector(sel)
                    if close_btn:
                        try:
                            await close_btn.click()
                            self.logger.debug("Closed popup")
                            break
                        except:
                            pass
                
                # If no close button, press ESC
                await page.keyboard.press('Escape')
                await asyncio.sleep(1)
            except:
                pass

            # Honest result: only count as applied when a confirmation marker was
            # seen, so silent failures are retried/marked FAILED instead of faked.
            return applied
            
        except Exception as e:
            self.logger.error(f"Error applying to Instahyre job: {e}", exc_info=True)
            return False


if __name__ == "__main__":
    print("Instahyre portal implementation ready")
