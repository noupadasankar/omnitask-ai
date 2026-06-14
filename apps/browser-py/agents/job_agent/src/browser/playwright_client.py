"""
Playwright Browser Client
Manages browser automation using Playwright.
"""

import asyncio
import logging
from typing import Optional, Dict, List, Any
from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright
import os
import json
from pathlib import Path


class PlaywrightClient:
    """Manages Playwright browser instance and interactions."""
    
    def __init__(self, headless: bool = False, slow_mo: int = 500):
        """Initialize Playwright client.
        
        Args:
            headless: Run browser in headless mode
            slow_mo: Slow down operations by specified milliseconds
        """
        self.headless = headless
        self.slow_mo = slow_mo
        self.playwright: Optional[Playwright] = None
        self.browser: Optional[Browser] = None
        self.context: Optional[BrowserContext] = None
        self.page: Optional[Page] = None
        self.logger = logging.getLogger(__name__)
        # When True this client wraps a browser owned by someone else (the
        # OmniTask Playwright engine). start()/close() then become no-ops so the
        # shared page + CDP screencast keep running for the live view.
        self._external = False

    @classmethod
    def from_page(cls, page: Page, context: BrowserContext) -> "PlaywrightClient":
        """Wrap an already-launched page/context instead of launching our own.

        Used when the job agent runs as a skill inside the OmniTask browser
        engine: the engine owns the browser lifecycle and live streaming, and
        the portals drive this shared page through the same client surface.
        """
        client = cls()
        client.page = page
        client.context = context
        client.browser = context.browser if context else None
        client.playwright = None
        client._external = True
        return client

    async def start(self):
        """Start the browser."""
        # Injected mode: the browser is already running — nothing to launch.
        if self._external:
            return
        self.playwright = await async_playwright().start()
        
        # Try to use system Chrome first (more reliable for OAuth)
        try:
            self.browser = await self.playwright.chromium.launch(
                channel='chrome',  # Use system Chrome instead of Chromium
                headless=self.headless,
                slow_mo=self.slow_mo,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            )
        except Exception as e:
            self.logger.debug(f"Could not launch system Chrome, trying Chromium: {e}")
            # Fallback to downloaded Chromium with anti-detection flags
            self.browser = await self.playwright.chromium.launch(
                headless=self.headless,
                slow_mo=self.slow_mo,
                args=[
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-web-security',
                    '--disable-features=IsolateOrigins,site-per-process'
                ]
            )
        
        # Create context with realistic user agent and settings
        self.context = await self.browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='Asia/Kolkata',
            permissions=['geolocation']
        )
        
        # Hide automation indicators
        await self.context.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        """)
        
        self.page = await self.context.new_page()
    
    async def close(self):
        """Close the browser."""
        # Injected mode: the OmniTask engine owns this browser and will close it
        # (and stop the live-view screencast) — never tear it down from here.
        if self._external:
            return
        if self.page:
            await self.page.close()
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
    
    async def goto(self, url: str, wait_until: str = "domcontentloaded") -> bool:
        """Navigate to a URL.
        
        Args:
            url: The URL to navigate to
            wait_until: When to consider navigation complete (domcontentloaded is faster than networkidle)
        
        Returns:
            True if navigation succeeded
        """
        try:
            await self.page.goto(url, wait_until=wait_until, timeout=90000)
            return True
        except Exception as e:
            self.logger.debug(f"Error navigating to {url}: {e}")
            return False
    
    async def wait_for_selector(self, selector: str, timeout: int = 10000) -> bool:
        """Wait for an element to appear.
        
        Args:
            selector: CSS selector of element
            timeout: Maximum time to wait in milliseconds
        
        Returns:
            True if element appeared
        """
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception:
            return False
    
    async def click(self, selector: str, timeout: int = 10000) -> bool:
        """Click an element.
        
        Args:
            selector: CSS selector of element to click
            timeout: Maximum time to wait
        
        Returns:
            True if click succeeded
        """
        try:
            await self.page.click(selector, timeout=timeout)
            return True
        except Exception as e:
            self.logger.debug(f"Error clicking {selector}: {e}")
            return False
    
    async def fill(self, selector: str, value: str, timeout: int = 10000) -> bool:
        """Fill an input field.
        
        Args:
            selector: CSS selector of input field
            value: Value to fill
            timeout: Maximum time to wait
        
        Returns:
            True if fill succeeded
        """
        try:
            await self.page.fill(selector, value, timeout=timeout)
            return True
        except Exception as e:
            self.logger.debug(f"Error filling {selector}: {e}")
            return False
    
    async def get_text(self, selector: str) -> Optional[str]:
        """Get text content of an element.
        
        Args:
            selector: CSS selector of element
        
        Returns:
            Text content or None
        """
        try:
            element = await self.page.query_selector(selector)
            if element:
                return await element.text_content()
        except Exception as e:
            self.logger.debug(f"Error getting text from {selector}: {e}")
        return None
    
    async def get_attribute(self, selector: str, attribute: str) -> Optional[str]:
        """Get attribute value of an element.
        
        Args:
            selector: CSS selector of element
            attribute: Attribute name
        
        Returns:
            Attribute value or None
        """
        try:
            element = await self.page.query_selector(selector)
            if element:
                return await element.get_attribute(attribute)
        except Exception as e:
            self.logger.debug(f"Error getting attribute from {selector}: {e}")
        return None
    
    async def query_selector_all(self, selector: str) -> List:
        """Get all elements matching selector.
        
        Args:
            selector: CSS selector
        
        Returns:
            List of matching elements
        """
        try:
            return await self.page.query_selector_all(selector)
        except Exception as e:
            self.logger.debug(f"Error querying {selector}: {e}")
            return []
    
    async def screenshot(self, path: str):
        """Take a screenshot.
        
        Args:
            path: Path to save screenshot
        """
        await self.page.screenshot(path=path)
    
    async def scroll_to_bottom(self, step: int = 500, max_scrolls: int = 10):
        """Scroll to bottom of page gradually.
        
        Args:
            step: Pixels to scroll each step
            max_scrolls: Maximum number of scroll steps
        """
        for _ in range(max_scrolls):
            await self.page.evaluate(f"window.scrollBy(0, {step})")
            await asyncio.sleep(0.5)
    
    async def wait(self, seconds: float):
        """Wait for specified seconds.
        
        Args:
            seconds: Time to wait
        """
        await asyncio.sleep(seconds)
    
    async def save_cookies(self, portal: str, save_dir: str = "data/sessions"):
        """Save cookies for a portal.
        
        Args:
            portal: Portal name
            save_dir: Directory to save cookies
        """
        Path(save_dir).mkdir(parents=True, exist_ok=True)
        cookies = await self.context.cookies()
        
        file_path = os.path.join(save_dir, f"{portal}_cookies.json")
        with open(file_path, 'w') as f:
            json.dump(cookies, f)
    
    async def load_cookies(self, portal: str, save_dir: str = "data/sessions") -> bool:
        """Load cookies for a portal.
        
        Args:
            portal: Portal name
            save_dir: Directory where cookies are saved
        
        Returns:
            True if cookies were loaded
        """
        file_path = os.path.join(save_dir, f"{portal}_cookies.json")
        if os.path.exists(file_path):
            try:
                with open(file_path, 'r') as f:
                    cookies = json.load(f)
                await self.context.add_cookies(cookies)
                return True
            except Exception as e:
                self.logger.debug(f"Error loading cookies: {e}")
        return False
    
    async def upload_file(self, selector: str, file_path: str) -> bool:
        """Upload a file.
        
        Args:
            selector: Selector for file input
            file_path: Path to file to upload
        
        Returns:
            True if upload succeeded
        """
        try:
            await self.page.set_input_files(selector, file_path)
            return True
        except Exception as e:
            self.logger.debug(f"Error uploading file: {e}")
            return False
    
    async def execute_script(self, script: str) -> Any:
        """Execute JavaScript in the page.
        
        Args:
            script: JavaScript code to execute
        
        Returns:
            Result of script execution
        """
        try:
            return await self.page.evaluate(script)
        except Exception as e:
            self.logger.debug(f"Error executing script: {e}")
            return None
    
    def get_page(self) -> Page:
        """Get the current page object."""
        return self.page
    
    async def get_url(self) -> str:
        """Get the current page URL."""
        try:
            return self.page.url if self.page else ""
        except Exception:
            return ""
    
    def get_context(self) -> BrowserContext:
        """Get the browser context."""
        return self.context
    
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()


if __name__ == "__main__":
    # Test the browser client
    async def test():
        async with PlaywrightClient(headless=False) as browser:
            await browser.goto("https://www.google.com")
            print("Browser test successful!")
            await browser.wait(2)
    
    asyncio.run(test())
