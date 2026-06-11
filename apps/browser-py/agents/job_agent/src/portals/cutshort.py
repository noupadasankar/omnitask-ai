"""
Cutshort Portal Implementation
"""

from typing import Dict, List
import asyncio
from .base_portal import BasePortal


class CutshortPortal(BasePortal):
    """Cutshort.io job portal implementation."""
    
    async def verify_login(self) -> bool:
        """Check if user is logged in to Cutshort."""
        try:
            current_url = await self.browser.get_url()
            if not current_url or 'cutshort.io' not in current_url:
                await self.browser.goto(self.base_url)
                await asyncio.sleep(3)
            
            # Wait for page to load
            await asyncio.sleep(2)
            
            # Check for profile indicators with multiple strategies
            profile_selectors = [
                'a[href*="/profile"]',
                'a[href*="/candidate/profile"]',
                '.user-menu',
                '.user-dropdown',
                'nav .dropdown',
                'button[aria-label*="profile"]',
                '[data-testid="user-menu"]',
                'a[href*="/dashboard"]'
            ]
            
            self.logger.debug(f"Checking Cutshort login at: {await self.browser.get_url()}")
            
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
            if 'dashboard' in title.lower() or 'profile' in title.lower():
                self.logger.debug(f"✓ Detected login from page title: {title}")
                return True
            
            # Check for session cookies
            cookies = await self.browser.get_context().cookies()
            if any('session' in c.get('name', '').lower() or 'auth' in c.get('name', '').lower() for c in cookies):
                self.logger.debug("✓ Found session cookies, assuming logged in")
                return True
            
            self.logger.debug("No login indicators found")
            return False
        except Exception as e:
            self.logger.debug(f"Error verifying Cutshort login: {e}")
            return False
    
    async def login(self) -> bool:
        """Login to Cutshort.
        
        Note: Requires manual login. Will wait for user to login.
        """
        try:
            # Try going to base URL first to check if already logged in
            await self.browser.goto(self.base_url)
            await asyncio.sleep(3)
            
            # Check if already logged in
            if await self.verify_login():
                self.logger.info("✅ Already logged in to Cutshort!")
                return True
            
            # Go to login page
            await self.browser.goto(self.login_url)
            await asyncio.sleep(3)
            
            # Check again after navigation
            if await self.verify_login():
                self.logger.info("✅ Already logged in to Cutshort!")
                return True
            
            # Wait for manual login
            self.logger.warning("=" * 60)
            self.logger.warning("⚠️  MANUAL LOGIN REQUIRED FOR CUTSHORT")
            self.logger.warning("=" * 60)
            self.logger.warning("Please login to Cutshort in the browser window:")
            self.logger.warning("  1. Enter your email and password")
            self.logger.warning("  2. OR use 'Continue with Google' if available")
            self.logger.warning("  3. Complete authentication")
            self.logger.warning("  4. Wait for dashboard to load")
            self.logger.warning("")
            self.logger.warning("⏱️  Waiting up to 120 seconds for login completion...")
            self.logger.warning("=" * 60)
            
            # Wait for login to complete
            for i in range(24):  # 24 * 5 = 120 seconds
                await asyncio.sleep(5)
                
                if await self.verify_login():
                    self.logger.info("✅ Login successful!")
                    await asyncio.sleep(2)
                    return True
                
                # Show progress
                if (i + 1) % 4 == 0:
                    remaining = 120 - ((i + 1) * 5)
                    self.logger.debug(f"Still waiting... {remaining}s remaining")
            
            self.logger.error("❌ Login timeout for Cutshort - please try running again")
            return False
        except Exception as e:
            self.logger.error(f"Error during Cutshort login: {e}")
            return False
    
    async def search_jobs(self) -> List[Dict]:
        """Search for jobs on Cutshort based on preferences."""
        jobs = []
        
        try:
            # Build search URL
            roles = self.user_preferences.get('roles', ['Software Engineer'])
            main_role = roles[0] if roles else 'Software Engineer'
            
            # Cutshort uses job role slugs in URL
            search_url = f"https://www.cutshort.io/jobs/{main_role.replace(' ', '-').lower()}"
            
            self.logger.info(f"Searching Cutshort: {search_url}")
            await self.browser.goto(search_url)
            await asyncio.sleep(4)
            
            # Wait for page to load completely
            page = self.browser.get_page()
            try:
                await page.wait_for_load_state('networkidle', timeout=15000)
            except:
                pass  # Continue even if networkidle times out
            await asyncio.sleep(2)
            
            # Scroll to load more jobs (lazy loading)
            for i in range(self.max_scroll):
                await self.browser.scroll_to_bottom(step=800, max_scrolls=2)
                await asyncio.sleep(3)  # Give time for content to load
            
            # Try multiple selector strategies to find job cards
            job_cards = []
            selectors_to_try = [
                'div[class*="job-card"]',  # Common pattern
                'div[class*="JobCard"]',  # React pattern
                'article',  # Semantic HTML
                'div[class*="job"]',
                'a[href^="/job/"]',  # Links to job pages
                '[data-job-id]',  # Data attribute
                'div[class*="listing"]',
                '.job-item',
            ]
            
            for selector in selectors_to_try:
                job_cards = await self.browser.query_selector_all(selector)
                if job_cards:
                    self.logger.debug(f"Found {len(job_cards)} cards with selector: {selector}")
                    break
            
            self.logger.info(f"Found {len(job_cards)} job cards on Cutshort")
            
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
            self.logger.error(f"Error searching Cutshort jobs: {e}", exc_info=True)
        
        return jobs
    
    async def _extract_job_from_card(self, card) -> Dict:
        """Extract job details from a job card element."""
        try:
            # Job title - try multiple selectors
            title = ''
            for selector in ['h2', 'h3', '.job-title', '[class*="title"]', '[class*="role"]']:
                title_elem = await card.query_selector(selector)
                if title_elem:
                    title = await title_elem.inner_text()
                    if title:
                        break
            
            # Company name
            company = ''
            for selector in ['[class*="company"] a', '[class*="company-name"]', '[class*="company"]', 'a[class*="employer"]']:
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
                job_url = f"https://www.cutshort.io{job_url}"
            
            # Location
            location = ''
            for selector in ['[class*="location"]', '[class*="city"]', '[class*="place"]', '.location']:
                location_elem = await card.query_selector(selector)
                if location_elem:
                    location = await location_elem.inner_text()
                    if location:
                        break
            
            # Salary (₹ symbol common in Indian portals)
            salary = ''
            for selector in ['[class*="salary"]', '[class*="compensation"]', '[class*="ctc"]', '[class*="lakh"]']:
                salary_elem = await card.query_selector(selector)
                if salary_elem:
                    salary = await salary_elem.inner_text()
                    if salary:
                        break
            
            # Experience
            experience = ''
            for selector in ['[class*="experience"]', '[class*="yrs"]', '[class*="exp"]']:
                exp_elem = await card.query_selector(selector)
                if exp_elem:
                    experience = await exp_elem.inner_text()
                    if experience:
                        break
            
            # Skills/Tags
            skills = []
            skill_selectors = ['[class*="skills"] span', '[class*="tag"]', '.skill-tag', '[class*="tech"]']
            for selector in skill_selectors:
                skill_elements = await card.query_selector_all(selector)
                if skill_elements:
                    for elem in skill_elements[:10]:  # Limit to 10 skills
                        try:
                            skill_text = await elem.inner_text()
                            if skill_text:
                                skills.append(skill_text.strip())
                        except:
                            continue
                if skills:
                    break
            
            # Description
            description = ''
            for selector in ['[class*="description"]', '[class*="detail"]', 'p']:
                desc_elem = await card.query_selector(selector)
                if desc_elem:
                    description = await desc_elem.inner_text()
                    if description:
                        break
            
            # Generate job_id from URL
            job_id = job_url.split('/')[-1] if job_url else ''
            
            return {
                'role': title.strip(),
                'company': company.strip(),
                'job_url': job_url,
                'job_id': job_id,
                'location': location.strip(),
                'salary': salary.strip(),
                'experience': experience.strip(),
                'skills': skills,
                'description': description.strip()[:500],  # Limit description length
                'portal': 'Cutshort'
            }
            
        except Exception as e:
            self.logger.debug(f"Error extracting job details: {e}")
            return {}
    
    async def apply_to_job(self, job: Dict) -> bool:
        """Apply to a job on Cutshort."""
        try:
            # Navigate to job URL
            if not await self.browser.goto(job['job_url']):
                return False
            
            await asyncio.sleep(3)
            
            # Look for apply button with multiple selectors
            apply_selectors = [
                'button[class*="apply"]',
                'button:has-text("Apply")',
                'button:has-text("Quick Apply")',
                'a[class*="apply"]',
                '[data-action="apply"]',
                '.apply-button',
                '#apply-btn'
            ]
            
            apply_button = None
            for selector in apply_selectors:
                try:
                    if await self.browser.wait_for_selector(selector, timeout=5000):
                        apply_button = selector
                        break
                except:
                    continue
            
            if not apply_button:
                self.logger.warning(f"No apply button found for: {job['role']}")
                return False
            
            # Check if already applied
            page_text = await self.browser.get_page().content()
            if 'applied' in page_text.lower() or 'already applied' in page_text.lower():
                self.logger.info(f"Already applied to: {job['role']}")
                return False
            
            # Click apply button
            if not await self.browser.click(apply_button):
                self.logger.warning(f"Failed to click apply button for: {job['role']}")
                return False
            
            await asyncio.sleep(2)
            
            # Handle any application form/popup
            # Check for confirmation or form submission
            page_text = await self.browser.get_page().content()
            if 'success' in page_text.lower() or 'submitted' in page_text.lower() or 'applied' in page_text.lower():
                self.logger.info(f"✅ Successfully applied to: {job['role']} at {job['company']}")
                return True
            
            # Look for submit button if there's a form
            submit_selectors = [
                'button[type="submit"]',
                'button:has-text("Submit")',
                'button:has-text("Send")',
                '.submit-button'
            ]
            
            for selector in submit_selectors:
                try:
                    if await self.browser.wait_for_selector(selector, timeout=3000):
                        await self.browser.click(selector)
                        await asyncio.sleep(2)
                        self.logger.info(f"✅ Application submitted for: {job['role']} at {job['company']}")
                        return True
                except:
                    continue
            
            # If we got here, we clicked apply but couldn't confirm
            self.logger.warning(f"⚠️  Clicked apply but couldn't confirm for: {job['role']}")
            return False
            
        except Exception as e:
            self.logger.error(f"Error applying to job: {e}")
            return False
