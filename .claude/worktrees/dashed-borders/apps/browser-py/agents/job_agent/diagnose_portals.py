"""
Diagnostic script to inspect portal page structures and find correct selectors
"""
import asyncio
from src.browser.playwright_client import PlaywrightClient
from src.utils.logger import get_logger

logger = get_logger("Diagnostic")

async def diagnose_instahyre():
    """Diagnose Instahyre matching jobs page"""
    print("\n" + "="*60)
    print("DIAGNOSING INSTAHYRE - Matching Jobs Page")
    print("="*60)
    
    browser = PlaywrightClient(headless=False, slow_mo=500)
    await browser.start()
    
    try:
        # Load saved session
        await browser.load_cookies("Instahyre")
        
        # Go to matching jobs page
        url = "https://www.instahyre.com/candidate/opportunities/?matching=true"
        await browser.goto(url)
        await asyncio.sleep(5)
        
        page = browser.get_page()
        
        # Try to find job cards with different selectors
        selectors = [
            'div[ng-repeat]',
            '.opportunity-card',
            '.job-card',
            'a[href*="/job/"]',
            '[class*="opportunity"]',
            'article',
        ]
        
        print("\n🔍 Testing selectors for job cards:")
        for selector in selectors:
            cards = await page.query_selector_all(selector)
            print(f"  {selector}: {len(cards)} cards found")
            
            if len(cards) > 0:
                # Try to extract details from first card
                card = cards[0]
                html = await card.inner_html()
                print(f"\n  Sample HTML (first 500 chars):")
                print(f"  {html[:500]}\n")
                
                # Try to find title
                title_selectors = ['h2', 'h3', '.title', '[class*="title"]', 'a']
                for ts in title_selectors:
                    elem = await card.query_selector(ts)
                    if elem:
                        text = await elem.inner_text()
                        if text and len(text.strip()) > 3:
                            print(f"  ✅ Title found with {ts}: {text[:50]}")
                            break
                
                # Try to find URL
                url = await card.get_attribute('href')
                if url:
                    print(f"  ✅ URL on card: {url}")
                else:
                    link = await card.query_selector('a')
                    if link:
                        url = await link.get_attribute('href')
                        print(f"  ✅ URL in <a>: {url}")
                
                break
        
        input("\n⏸️  Press Enter to continue...")
        
    finally:
        await browser.close()

async def diagnose_naukri():
    """Diagnose Naukri recommended jobs page"""
    print("\n" + "="*60)
    print("DIAGNOSING NAUKRI - Recommended Jobs Page")
    print("="*60)
    
    browser = PlaywrightClient(headless=False, slow_mo=500)
    await browser.start()
    
    try:
        # Load saved session
        await browser.load_cookies("Naukri.com")
        
        # Go to homepage first
        await browser.goto("https://www.naukri.com/mnjuser/homepage")
        await asyncio.sleep(3)
        
        # Then to recommended jobs
        url = "https://www.naukri.com/mnjuser/recommendedjobs"
        await browser.goto(url)
        await asyncio.sleep(5)
        
        page = browser.get_page()
        
        # Try to find job cards with different selectors
        selectors = [
            '.srp-jobtuple-wrapper',  # Search results
            'article',
            '.jobTuple',
            '[class*="job-tuple"]',
            '.list',
            'div[class*="job"]',
            '.recommended-job',
        ]
        
        print("\n🔍 Testing selectors for job cards:")
        for selector in selectors:
            cards = await page.query_selector_all(selector)
            print(f"  {selector}: {len(cards)} cards found")
            
            if len(cards) > 0:
                # Try to extract details from first card
                card = cards[0]
                html = await card.inner_html()
                print(f"\n  Sample HTML (first 500 chars):")
                print(f"  {html[:500]}\n")
                
                # Try to find title
                title_selectors = ['.title', 'h2', 'h3', 'a[class*="title"]']
                for ts in title_selectors:
                    elem = await card.query_selector(ts)
                    if elem:
                        text = await elem.inner_text()
                        if text:
                            print(f"  ✅ Title found with {ts}: {text[:50]}")
                            break
                
                break
        
        input("\n⏸️  Press Enter to continue...")
        
    finally:
        await browser.close()

async def diagnose_hirist_apply():
    """Diagnose Hirist apply button on job detail page"""
    print("\n" + "="*60)
    print("DIAGNOSING HIRIST - Apply Button Detection")
    print("="*60)
    
    browser = PlaywrightClient(headless=False, slow_mo=500)
    await browser.start()
    
    try:
        # Load saved session
        await browser.load_cookies("Hirist")
        
        # Go to job page (you'll need to manually navigate to a job)
        url = "https://www.hirist.tech/c/ai-ml-jobs?ref=topnavigation"
        await browser.goto(url)
        await asyncio.sleep(3)
        
        print("\n📝 Please click on a job card to open the job detail page...")
        print("   (The script will wait for you to navigate)")
        
        await asyncio.sleep(10)
        
        page = browser.get_page()
        current_url = await browser.get_url()
        print(f"\n🌐 Current URL: {current_url}")
        
        # Try to find apply button
        selectors = [
            'button:has-text("Apply")',
            'a:has-text("Apply")',
            '.apply',
            '.apply-btn',
            'button.apply',
            '#apply-button',
            '[class*="apply"]',
            'button[type="submit"]',
            'input[type="submit"]',
        ]
        
        print("\n🔍 Testing selectors for Apply button:")
        for selector in selectors:
            try:
                elements = await page.query_selector_all(selector)
                print(f"  {selector}: {len(elements)} elements found")
                
                if len(elements) > 0:
                    elem = elements[0]
                    text = await elem.inner_text() if await elem.inner_text() else await elem.get_attribute('value')
                    print(f"    Text: {text}")
                    html = await elem.evaluate('el => el.outerHTML')
                    print(f"    HTML: {html[:200]}")
            except Exception as e:
                print(f"  {selector}: Error - {e}")
        
        input("\n⏸️  Press Enter to close...")
        
    finally:
        await browser.close()

async def main():
    """Run all diagnostics"""
    print("\n🔧 Portal Diagnostic Tool")
    print("="*60)
    print("This will help identify correct selectors for each portal")
    print("="*60)
    
    print("\nWhich portal do you want to diagnose?")
    print("1. Instahyre (matching jobs extraction)")
    print("2. Naukri (recommended jobs extraction)")
    print("3. Hirist (apply button)")
    print("4. All portals")
    
    choice = input("\nChoice (1-4): ").strip()
    
    if choice == '1':
        await diagnose_instahyre()
    elif choice == '2':
        await diagnose_naukri()
    elif choice == '3':
        await diagnose_hirist_apply()
    elif choice == '4':
        await diagnose_instahyre()
        await diagnose_naukri()
        await diagnose_hirist_apply()
    else:
        print("Invalid choice")

if __name__ == "__main__":
    asyncio.run(main())
