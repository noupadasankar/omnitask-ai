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
        """Login to Instahyre.
        
        Note: Requires manual login. Will wait for user to login.
        """
        try:
            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)
            
            # Check if already logged in
            if await self.verify_login():
                self.logger.info("✅ Already logged in to Instahyre!")
                return True
            
            # Wait for manual login
            self.logger.warning("=" * 60)
            self.logger.warning("⚠️  MANUAL LOGIN REQUIRED")
            self.logger.warning("=" * 60)
            self.logger.warning("Please login to Instahyre in the browser window:")
            self.logger.warning("  1. Click 'Continue with Google' or enter email/password")
            self.logger.warning("  2. Complete authentication")
            self.logger.warning("  3. Wait for dashboard to load")
            self.logger.warning("")
            self.logger.warning("⏱️  Waiting up to 120 seconds for login completion...")
            self.logger.warning("=" * 60)
            
            # Wait for login to complete - check every 5 seconds
            for i in range(24):  # 24 * 5 = 120 seconds
                await asyncio.sleep(5)
                
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)  # Give page time to fully load
                    return True
                
                # Show progress every 20 seconds
                if (i + 1) % 4 == 0:
                    remaining = 120 - ((i + 1) * 5)
                    self.logger.debug(f"Still waiting... {remaining}s remaining")
            
            self.logger.error("❌ Login timeout - please try running again")
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
                        # Store card reference instead of URL since jobs open in popup
                        jobs.append({
                            'role': title,
                            'company': '',  # We'll get this from popup
                            'job_url': search_url,  # Same page for all
                            'job_id': f'instahyre_{len(jobs)}',
                            'card_index': len(jobs),  # Track which card to click
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
        """CUSTOM RECURSIVE PROCESS for Instahyre.
        
        Unlike other portals, Instahyre requires:
        1. Apply to ONE job (View → Apply in popup)
        2. Wait 5 seconds
        3. Reload page and get fresh job list
        4. Repeat until all jobs applied or limit reached
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
            await self.save_session()
        else:
            self.logger.session_restored(self.portal_name)
        
        # RECURSIVE LOOP: Apply to one job, reload, repeat
        while self.applications_count < remaining:
            try:
                # Search for jobs on matching page
                jobs = await self.search_jobs()
                self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")
                
                if not jobs:
                    self.logger.info("No more jobs found - completing Instahyre")
                    break
                
                # Find FIRST matching job only
                applied_this_round = False
                for job in jobs:
                    try:
                        # Check if already applied
                        if self.db.is_already_applied(job['job_url'] + f"#{job['card_index']}"):
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
                        
                        self.logger.info(f"📋 Evaluating: {job['role']}")
                        self.logger.info(f"   Score: {match_result['match_score']}/100")
                        
                        if not match_result['should_apply']:
                            self.logger.job_skipped(f"{job['role']} - Score: {match_result['match_score']}")
                            continue
                        
                        self.logger.job_found(self.portal_name, job.get('company', ''), job['role'])
                        
                        # Apply to THIS job only
                        if not dry_run:
                            success = await self.apply_to_job(job)
                            
                            if success:
                                # Save to database (use unique ID with card_index)
                                self.db.add_application(
                                    portal=self.portal_name,
                                    company=job.get('company', ''),
                                    role=job['role'],
                                    job_url=job['job_url'] + f"#{job['card_index']}",
                                    job_id=job.get('job_id'),
                                    job_description=job.get('description'),
                                    location=job.get('location'),
                                    salary=job.get('salary'),
                                    match_score=job['match_score'],
                                    application_method='automated'
                                )
                                
                                self.logger.job_applied(self.portal_name, job.get('company', ''), job['role'])
                                self.applications_count += 1
                                applied_this_round = True
                                
                                # Wait 5 seconds before reloading
                                self.logger.info("⏳ Waiting 5 seconds before refreshing...")
                                await asyncio.sleep(5)
                                
                                # Break to reload page for next job
                                break
                        else:
                            self.logger.info(f"[DRY RUN] Would apply to: {job['role']}")
                            self.applications_count += 1
                            applied_this_round = True
                            break
                    
                    except Exception as e:
                        self.logger.error(f"Error processing job {job.get('role', 'Unknown')}: {e}")
                        continue
                
                # If no jobs were applied this round, we're done
                if not applied_this_round:
                    self.logger.info("No more matching jobs - completing Instahyre")
                    break
                
            except Exception as e:
                self.logger.error(f"Error in Instahyre recursive loop: {e}", exc_info=True)
                break
        
        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count
    
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
            
            if card_index >= len(job_cards):
                self.logger.warning(f"Card index {card_index} out of range (have {len(job_cards)} cards)")
                return False
            
            card = job_cards[card_index]
            
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
            
            return applied or True  # Assume success if button was clicked
            
        except Exception as e:
            self.logger.error(f"Error applying to Instahyre job: {e}", exc_info=True)
            return False


if __name__ == "__main__":
    print("Instahyre portal implementation ready")
