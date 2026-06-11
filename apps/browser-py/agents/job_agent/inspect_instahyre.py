#!/usr/bin/env python3
"""
Live Instahyre Page Inspector
Shows exactly what's on the page so we can fix selectors.
"""

import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent / "src"))

from browser.playwright_client import PlaywrightClient


async def inspect_instahyre():
    """Inspect Instahyre page structure."""
    browser = None
    
    try:
        print("=" * 70)
        print("🔍 INSTAHYRE PAGE INSPECTOR")
        print("=" * 70)
        
        # Initialize browser
        browser = PlaywrightClient(headless=False, slow_mo=1000)
        await browser.start()
        print("✅ Browser started\n")
        
        # Navigate to search jobs
        url = "https://www.instahyre.com/search-jobs/"
        print(f"📍 Navigating to: {url}")
        await browser.goto(url)
        await asyncio.sleep(5)
        
        print("⏳ Waiting for page to load...")
        page = browser.get_page()
        try:
            await page.wait_for_load_state('networkidle', timeout=15000)
        except:
            print("   Timeout waiting for networkidle, continuing...")
        await asyncio.sleep(3)
        
        # Scroll
        print("📜 Scrolling to load content...")
        for i in range(2):
            await browser.scroll_to_bottom(step=800, max_scrolls=2)
            await asyncio.sleep(2)
        
        print("\n" + "=" * 70)
        print("📊 ANALYZING PAGE STRUCTURE")
        print("=" * 70)
        
        # Get page info
        page_info = await page.evaluate("""
            () => {
                return {
                    title: document.title,
                    url: window.location.href,
                    bodyClasses: document.body.className,
                    
                    // Count various elements
                    divCount: document.querySelectorAll('div').length,
                    articleCount: document.querySelectorAll('article').length,
                    aCount: document.querySelectorAll('a').length,
                    
                    // Try to find job-related elements
                    opportunityCards: document.querySelectorAll('.opportunity-card').length,
                    jobCards: document.querySelectorAll('[class*="job-card"]').length,
                    articles: document.querySelectorAll('article').length,
                    jobLinks: document.querySelectorAll('a[href*="/job"]').length,
                    
                    // Get all unique class names that contain "job" or "opportunity"
                    relevantClasses: Array.from(document.querySelectorAll('*'))
                        .map(el => el.className)
                        .filter(c => typeof c === 'string' && (c.includes('job') || c.includes('opportunity') || c.includes('card')))
                        .filter((v, i, a) => a.indexOf(v) === i)
                        .slice(0, 20),
                    
                    // Get first 5 divs with significant content
                    mainDivs: Array.from(document.querySelectorAll('div'))
                        .filter(div => div.innerText && div.innerText.length > 50 && div.innerText.length < 500)
                        .slice(0, 5)
                        .map(div => ({
                            className: div.className,
                            textPreview: div.innerText.substring(0, 100),
                            hasLink: !!div.querySelector('a'),
                            linkHref: div.querySelector('a')?.href || ''
                        }))
                };
            }
        """)
        
        print(f"\n📄 Page Title: {page_info['title']}")
        print(f"🔗 Current URL: {page_info['url']}")
        print(f"📦 Body Classes: {page_info['bodyClasses']}")
        
        print(f"\n📊 Element Counts:")
        print(f"   Total divs: {page_info['divCount']}")
        print(f"   Total articles: {page_info['articleCount']}")
        print(f"   Total links: {page_info['aCount']}")
        
        print(f"\n🎯 Job-Related Elements:")
        print(f"   .opportunity-card: {page_info['opportunityCards']}")
        print(f"   [class*='job-card']: {page_info['jobCards']}")
        print(f"   <article>: {page_info['articles']}")
        print(f"   a[href*='/job']: {page_info['jobLinks']}")
        
        print(f"\n🏷️  Relevant Class Names Found:")
        for cls in page_info['relevantClasses'][:15]:
            print(f"   • {cls}")
        
        print(f"\n📋 Sample Content Divs:")
        for i, div in enumerate(page_info['mainDivs'], 1):
            print(f"\n   Div {i}:")
            print(f"      Class: {div['className']}")
            print(f"      Text: {div['textPreview']}...")
            print(f"      Has Link: {div['hasLink']}")
            if div['linkHref']:
                print(f"      Link: {div['linkHref'][:80]}")
        
        # Try specific selectors
        print("\n" + "=" * 70)
        print("🔍 TESTING SELECTORS")
        print("=" * 70)
        
        test_selectors = [
            '.opportunity-card',
            'div[class*="job-card"]',
            'article',
            'a[href*="/job/"]',
            '[data-job-id]',
            'div[ng-repeat]',
            '.job-listing',
            '[class*="listing"]',
        ]
        
        for selector in test_selectors:
            elements = await browser.query_selector_all(selector)
            count = len(elements)
            status = "✅" if count > 0 else "❌"
            print(f"{status} {selector:30} → {count} elements")
            
            # If found, show first element info
            if count > 0 and elements:
                try:
                    first_html = await elements[0].inner_html()
                    print(f"     First element HTML (preview): {first_html[:150]}...")
                except:
                    pass
        
        print("\n" + "=" * 70)
        print("✅ INSPECTION COMPLETE")
        print("=" * 70)
        print("\n⏸️  Browser will stay open for 30 seconds for manual inspection.")
        print("   Press Ctrl+C to exit earlier.\n")
        
        await asyncio.sleep(30)
        
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if browser:
            await browser.close()
            print("\n✅ Browser closed")


def main():
    """Run inspector."""
    try:
        asyncio.run(inspect_instahyre())
    except KeyboardInterrupt:
        print("\n👋 Goodbye!")


if __name__ == "__main__":
    main()
