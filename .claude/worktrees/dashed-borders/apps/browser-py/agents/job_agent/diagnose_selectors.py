#!/usr/bin/env python3
"""
Portal Selector Diagnostic Tool
Helps identify the correct selectors for job portal elements.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from browser.playwright_client import PlaywrightClient
from utils.logger import setup_logger


async def diagnose_instahyre():
    """Diagnose Instahyre selectors."""
    logger = setup_logger("diagnose-instahyre")
    browser = None
    
    try:
        logger.info("=" * 70)
        logger.info("🔍 INSTAHYRE SELECTOR DIAGNOSTIC TOOL")
        logger.info("=" * 70)
        
        # Initialize browser
        browser = PlaywrightClient(headless=False, slow_mo=1000)
        await browser.start()
        logger.info("✅ Browser started")
        
        # Navigate to Instahyre jobs page
        logger.info("\n📍 Navigating to Instahyre jobs page...")
        search_url = "https://www.instahyre.com/search-jobs/"
        await browser.goto(search_url)
        await asyncio.sleep(5)
        
        current_url = await browser.get_url()
        logger.info(f"Current URL: {current_url}")
        
        # Manual login check
        logger.info("\n" + "=" * 70)
        logger.info("🔐 LOGIN CHECK")
        logger.info("=" * 70)
        logger.info("If you're not logged in, please login now.")
        logger.info("Waiting 30 seconds...")
        await asyncio.sleep(30)
        
        # Check page structure
        logger.info("\n" + "=" * 70)
        logger.info("🔍 CHECKING PAGE STRUCTURE")
        logger.info("=" * 70)
        
        page = browser.get_page()
        
        # Test different job card selectors
        selectors_to_test = [
            '.opportunity-card',
            '.job-card',
            '[class*="job"]',
            '[class*="opportunity"]',
            'article',
            '[data-testid*="job"]',
            '.search-result',
            '.listing-card'
        ]
        
        logger.info("\n📋 Testing possible job card selectors:")
        for selector in selectors_to_test:
            try:
                elements = await browser.query_selector_all(selector)
                count = len(elements)
                if count > 0:
                    logger.info(f"  ✅ {selector:30} → Found {count} elements")
                    
                    # Get class names of first element
                    if elements:
                        classes = await elements[0].get_attribute('class')
                        logger.info(f"      First element classes: {classes}")
                else:
                    logger.info(f"  ❌ {selector:30} → No elements")
            except Exception as e:
                logger.info(f"  ⚠️  {selector:30} → Error: {e}")
        
        # Get page HTML to inspect
        logger.info("\n📄 Getting page structure...")
        html_preview = await page.evaluate("""
            () => {
                // Find all elements that might be job cards
                const possibleCards = Array.from(document.querySelectorAll('div[class*="card"], article, div[class*="job"], div[class*="result"], div[class*="listing"]'));
                
                return {
                    title: document.title,
                    bodyClasses: document.body.className,
                    mainContainer: document.querySelector('main') ? document.querySelector('main').className : 'No main found',
                    possibleCardCount: possibleCards.length,
                    firstCardClasses: possibleCards[0] ? possibleCards[0].className : 'No cards',
                    firstCardHTML: possibleCards[0] ? possibleCards[0].outerHTML.substring(0, 300) : 'No cards'
                };
            }
        """)
        
        logger.info(f"\n📊 Page Info:")
        logger.info(f"  Title: {html_preview['title']}")
        logger.info(f"  Body classes: {html_preview['bodyClasses']}")
        logger.info(f"  Main container: {html_preview['mainContainer']}")
        logger.info(f"  Possible card elements: {html_preview['possibleCardCount']}")
        logger.info(f"  First card classes: {html_preview['firstCardClasses']}")
        logger.info(f"\n  First card HTML preview:")
        logger.info(f"  {html_preview['firstCardHTML']}...")
        
        # Check login indicators
        logger.info("\n" + "=" * 70)
        logger.info("🔐 CHECKING LOGIN INDICATORS")
        logger.info("=" * 70)
        
        login_selectors = [
            'a[href*="/candidate/profile"]',
            'a[href*="/profile"]',
            '.user-menu',
            '.user-dropdown',
            'nav .dropdown',
            'button[aria-label*="profile"]'
        ]
        
        for selector in login_selectors:
            try:
                if await browser.wait_for_selector(selector, timeout=2000):
                    logger.info(f"  ✅ Found: {selector}")
                else:
                    logger.info(f"  ❌ Not found: {selector}")
            except:
                logger.info(f"  ❌ Not found: {selector}")
        
        # Check cookies
        cookies = await browser.get_context().cookies()
        session_cookies = [c for c in cookies if 'session' in c.get('name', '').lower() or 'auth' in c.get('name', '').lower()]
        logger.info(f"\n🍪 Session cookies found: {len(session_cookies)}")
        for cookie in session_cookies:
            logger.info(f"   - {cookie['name']}")
        
        logger.info("\n" + "=" * 70)
        logger.info("✅ DIAGNOSTIC COMPLETE")
        logger.info("=" * 70)
        logger.info("\nBrowser will stay open for 30 seconds so you can inspect.")
        logger.info("Press Ctrl+C to exit earlier.")
        
        await asyncio.sleep(30)
        
    except KeyboardInterrupt:
        logger.info("\n\n⚠️  Interrupted by user")
    except Exception as e:
        logger.error(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if browser:
            await browser.close()
            logger.info("\n✅ Browser closed")


def main():
    """Run diagnostic."""
    try:
        asyncio.run(diagnose_instahyre())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")


if __name__ == "__main__":
    main()
