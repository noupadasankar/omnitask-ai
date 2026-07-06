#!/usr/bin/env python3
"""
Quick browser test to verify system Chrome integration and OAuth compatibility.
"""

import asyncio
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from browser.playwright_client import PlaywrightClient
from utils.logger import setup_logger


async def test_browser():
    """Test browser with OAuth-enabled sites."""
    logger = setup_logger("test-browser")
    browser = None
    
    try:
        logger.info("=" * 60)
        logger.info("🧪 Testing System Chrome Integration")
        logger.info("=" * 60)
        
        # Initialize browser
        logger.info("\n1️⃣  Initializing browser client...")
        browser = PlaywrightClient(headless=False, slow_mo=500)
        await browser.start()
        logger.info("✅ Browser started successfully!")
        
        # Get browser info
        page = browser.get_page()
        user_agent = await page.evaluate("() => navigator.userAgent")
        logger.info(f"\n📋 User Agent: {user_agent[:80]}...")
        
        # Check webdriver property
        webdriver = await page.evaluate("() => navigator.webdriver")
        if webdriver is None or webdriver is False:
            logger.info("✅ navigator.webdriver is hidden (good for OAuth)")
        else:
            logger.warning(f"⚠️  navigator.webdriver = {webdriver} (may trigger OAuth blocks)")
        
        # Test navigation to Instahyre
        logger.info("\n2️⃣  Testing navigation to Instahyre...")
        await browser.goto("https://www.instahyre.com")
        await asyncio.sleep(2)
        
        current_url = await browser.get_url()
        logger.info(f"✅ Current URL: {current_url}")
        
        # Test OAuth login page
        logger.info("\n3️⃣  Navigating to login page...")
        await browser.goto("https://www.instahyre.com/login/")
        await asyncio.sleep(3)
        
        current_url = await browser.get_url()
        logger.info(f"Current URL: {current_url}")
        
        # Manual intervention point
        logger.info("\n" + "=" * 60)
        logger.info("🔐 MANUAL TEST: Try logging in with Google")
        logger.info("=" * 60)
        logger.info("Please try the following in the browser:")
        logger.info("  1. Click 'Continue with Google' button")
        logger.info("  2. Check if Google OAuth screen appears")
        logger.info("  3. Try to login with your Google account")
        logger.info("")
        logger.info("Expected: OAuth should work without 'insecure browser' error")
        logger.info("")
        logger.info("⏱️  Browser will stay open for 60 seconds...")
        logger.info("    Press Ctrl+C to exit earlier")
        logger.info("=" * 60)
        
        # Wait for manual testing
        await asyncio.sleep(60)
        
        logger.info("\n✅ Test complete!")
        
    except KeyboardInterrupt:
        logger.info("\n\n⚠️  Test interrupted by user")
    except Exception as e:
        logger.error(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if browser:
            logger.info("\n🔒 Closing browser...")
            await browser.close()
            logger.info("✅ Browser closed")


def main():
    """Run the test."""
    try:
        asyncio.run(test_browser())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")


if __name__ == "__main__":
    main()
