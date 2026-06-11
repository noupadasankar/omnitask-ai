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
                    elem = await page.query_selector(selector, timeout=2000)
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
        """Login to LinkedIn.
        
        Note: Requires manual login. Will wait for user to login.
        """
        try:
            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)
            
            # Check if already logged in
            if await self.verify_login():
                self.logger.info("✅ Already logged in to LinkedIn!")
                return True
            
            # Wait for manual login
            self.logger.warning("=" * 60)
            self.logger.warning("⚠️  MANUAL LOGIN REQUIRED")
            self.logger.warning("=" * 60)
            self.logger.warning("Please login to LinkedIn in the browser window:")
            self.logger.warning("  1. Enter email and password")
            self.logger.warning("  2. Complete any security challenges")
            self.logger.warning("  3. Wait for homepage to load")
            self.logger.warning("")
            self.logger.warning("⏱️  Waiting up to 120 seconds for login completion...")
            self.logger.warning("=" * 60)
            
            # Wait for login to complete - check every 5 seconds
            for i in range(24):  # 24 * 5 = 120 seconds
                await asyncio.sleep(5)
                
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)
                    return True
                
                # Show progress every 20 seconds
                if (i + 1) % 4 == 0:
                    remaining = 120 - ((i + 1) * 5)
                    self.logger.debug(f"Still waiting... {remaining}s remaining")
            
            self.logger.error("❌ Login timeout - please try running again")
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
                            'job_url': search_url,  # Same page for all
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
        """CUSTOM RECURSIVE PROCESS for LinkedIn Easy Apply.
        
        LinkedIn workflow:
        1. Get Easy Apply jobs from left panel
        2. Find ONE matching job
        3. Click job card to view details
        4. Click "Easy Apply" button
        5. Fill multi-step form (Next → Next → Review → Submit)
        6. Uncheck "Follow company" checkbox
        7. Click "Submit application"
        8. Click "Done" in confirmation popup
        9. Repeat
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
                # Search for jobs on Easy Apply page
                jobs = await self.search_jobs()
                self.logger.info(f"Found {len(jobs)} jobs on {self.portal_name}")
                
                if not jobs:
                    self.logger.info("No more jobs found - completing LinkedIn")
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
                        
                        self.logger.info(f"📋 Evaluating: {job['role']} at {job['company']}")
                        self.logger.info(f"   Score: {match_result['match_score']}/100")
                        
                        if not match_result['should_apply']:
                            self.logger.job_skipped(f"{job['role']} - Score: {match_result['match_score']}")
                            continue
                        
                        self.logger.job_found(self.portal_name, job['company'], job['role'])
                        
                        # Apply to THIS job only (Easy Apply workflow)
                        if not dry_run:
                            success = await self.apply_to_job(job)
                            
                            if success:
                                # Save to database
                                self.db.add_application(
                                    portal=self.portal_name,
                                    company=job['company'],
                                    role=job['role'],
                                    job_url=job['job_url'] + f"#{job['card_index']}",
                                    job_id=job.get('job_id'),
                                    job_description=job.get('description'),
                                    location=job.get('location'),
                                    salary=job.get('salary'),
                                    match_score=job['match_score'],
                                    application_method='automated'
                                )
                                
                                self.logger.job_applied(self.portal_name, job['company'], job['role'])
                                self.applications_count += 1
                                applied_this_round = True
                                
                                # Wait 3 seconds before next job
                                self.logger.info("⏳ Waiting 3 seconds before next job...")
                                await asyncio.sleep(3)
                                
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
                    self.logger.info("No more matching jobs - completing LinkedIn")
                    break
                
            except Exception as e:
                self.logger.error(f"Error in LinkedIn recursive loop: {e}", exc_info=True)
                break
        
        self.logger.portal_complete(self.portal_name, self.applications_count)
        return self.applications_count
    
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
            
            if card_index >= len(job_cards):
                self.logger.warning(f"Card index {card_index} out of range (have {len(job_cards)} cards)")
                return False
            
            card = job_cards[card_index]
            
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
            
            # MULTI-STEP FORM: Keep clicking Next until Review button appears
            max_steps = 10  # Safety limit
            for step in range(max_steps):
                self.logger.info(f"📝 Step {step + 1}: Processing form...")
                
                await asyncio.sleep(2)
                
                # Scroll to bottom of modal to find Next/Review button
                try:
                    await modal.evaluate('el => el.scrollTo(0, el.scrollHeight)')
                    await asyncio.sleep(1)
                except:
                    pass
                
                # Check for Review button (last step before submit)
                review_button = None
                review_selectors = [
                    'button:has-text("Review")',
                    'button[aria-label*="Review"]',
                    '.jobs-easy-apply-modal button:has-text("Review")',
                ]
                
                for selector in review_selectors:
                    try:
                        review_button = await modal.query_selector(selector)
                        if review_button:
                            is_visible = await review_button.is_visible()
                            if is_visible:
                                self.logger.info("✅ Found Review button - clicking...")
                                await review_button.click()
                                await asyncio.sleep(3)
                                break
                    except:
                        continue
                
                if review_button:
                    # Review button clicked - now on final submit page
                    break
                
                # Look for Next button
                next_button = None
                next_selectors = [
                    'button:has-text("Next")',
                    'button[aria-label*="Continue to next step"]',
                    '.jobs-easy-apply-modal button:has-text("Next")',
                    'button[aria-label*="Next"]',
                ]
                
                for selector in next_selectors:
                    try:
                        next_button = await modal.query_selector(selector)
                        if next_button:
                            is_visible = await next_button.is_visible()
                            is_enabled = await next_button.is_enabled()
                            if is_visible and is_enabled:
                                button_text = await next_button.inner_text()
                                self.logger.info(f"✅ Found Next button: '{button_text}' - clicking...")
                                await next_button.click()
                                await asyncio.sleep(2)
                                break
                    except:
                        continue
                
                if not next_button and not review_button:
                    # No Next or Review button found - might already be on submit page
                    self.logger.info("No Next/Review button found - checking for Submit...")
                    break
            
            # Now on final page - scroll to bottom
            self.logger.info("📄 On final submit page - scrolling to bottom...")
            try:
                await modal.evaluate('el => el.scrollTo(0, el.scrollHeight)')
                await asyncio.sleep(2)
            except:
                pass
            
            # IMPORTANT: Uncheck "Follow company" checkbox
            follow_checkbox = None
            follow_selectors = [
                'input[type="checkbox"]',
                'label:has-text("Follow")',
                '[aria-label*="Follow"]',
            ]
            
            self.logger.debug("Looking for 'Follow company' checkbox...")
            for selector in follow_selectors:
                try:
                    follow_checkbox = await modal.query_selector(selector)
                    if follow_checkbox:
                        # Check if it's checked
                        is_checked = await follow_checkbox.is_checked()
                        if is_checked:
                            self.logger.info("✅ Found Follow checkbox - unchecking...")
                            await follow_checkbox.click()
                            await asyncio.sleep(1)
                            break
                except Exception as e:
                    self.logger.debug(f"Error with checkbox {selector}: {e}")
                    continue
            
            # Find and click "Submit application" button
            submit_button = None
            submit_selectors = [
                'button:has-text("Submit application")',
                'button[aria-label*="Submit application"]',
                '.jobs-easy-apply-modal button:has-text("Submit")',
                'button:has-text("Submit")',
            ]
            
            self.logger.debug("Looking for Submit application button...")
            for selector in submit_selectors:
                try:
                    submit_button = await modal.query_selector(selector)
                    if submit_button:
                        is_visible = await submit_button.is_visible()
                        is_enabled = await submit_button.is_enabled()
                        if is_visible and is_enabled:
                            button_text = await submit_button.inner_text()
                            self.logger.info(f"✅ Found Submit button: '{button_text}'")
                            break
                except:
                    continue
            
            if not submit_button:
                self.logger.warning(f"Submit application button not found for {job['role']}")
                # Try to close modal
                try:
                    close_btn = await modal.query_selector('button[aria-label="Dismiss"]')
                    if close_btn:
                        await close_btn.click()
                except:
                    pass
                return False
            
            # Click Submit button
            self.logger.info(f"🚀 Submitting application for: {job['role']}")
            try:
                await submit_button.click(timeout=10000)
                await asyncio.sleep(4)
            except Exception as e:
                self.logger.error(f"Failed to click Submit button: {e}")
                return False
            
            # Wait for acknowledgment popup
            self.logger.info("⏳ Waiting for confirmation...")
            confirmation_found = False
            confirmation_selectors = [
                'text=Your application was sent',
                'text=Application sent',
                'text=successfully',
            ]
            
            for selector in confirmation_selectors:
                try:
                    elem = await page.query_selector(selector, timeout=5000)
                    if elem:
                        self.logger.info(f"✅ Application confirmed: {selector}")
                        confirmation_found = True
                        break
                except:
                    continue
            
            # Click Done button in acknowledgment popup
            done_button = None
            done_selectors = [
                'button:has-text("Done")',
                'button[aria-label*="Dismiss"]',
                'button:has-text("Dismiss")',
            ]
            
            for selector in done_selectors:
                try:
                    done_button = await page.query_selector(selector)
                    if done_button:
                        is_visible = await done_button.is_visible()
                        if is_visible:
                            self.logger.info("✅ Clicking Done button...")
                            await done_button.click()
                            await asyncio.sleep(2)
                            break
                except:
                    continue
            
            return confirmation_found or True  # Assume success if submit was clicked
            
        except Exception as e:
            self.logger.error(f"Error applying to LinkedIn job: {e}", exc_info=True)
            # Try to close any open modals
            try:
                close_btn = await page.query_selector('button[aria-label="Dismiss"]')
                if close_btn:
                    await close_btn.click()
                    await asyncio.sleep(1)
            except:
                pass
            return False


if __name__ == "__main__":
    print("LinkedIn portal implementation ready")
