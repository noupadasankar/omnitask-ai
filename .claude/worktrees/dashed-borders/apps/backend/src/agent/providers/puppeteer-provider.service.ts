import { Injectable, Logger } from '@nestjs/common';
import { BrowserProvider, ExtractedElement } from './browser-provider.interface';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

puppeteer.use(StealthPlugin());

@Injectable()
export class PuppeteerProvider implements BrowserProvider {
  private readonly logger = new Logger(PuppeteerProvider.name);
  private activeBrowsers = new Map<string, Browser>();
  private activePages = new Map<string, Page>();

  async launch(
    sessionId: string,
    userId: string,
    config: { headless?: boolean; width?: number; height?: number } = {},
  ): Promise<void> {
    this.logger.log(`Launching Puppeteer-Stealth instance for session: ${sessionId}`);
    const width = config.width || 1280;
    const height = config.height || 720;

    const browser = await puppeteer.launch({
      headless: config.headless !== false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        `--window-size=${width},${height}`,
      ],
      defaultViewport: { width, height },
    });

    const page = await browser.newPage();
    await page.setViewport({ width, height });

    this.activeBrowsers.set(sessionId, browser);
    this.activePages.set(sessionId, page);
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    return page.url();
  }

  async click(sessionId: string, target: string): Promise<void> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Clicking element: "${target}"`);
    await page.waitForSelector(target, { timeout: 15000 });
    await page.click(target);
  }

  async type(sessionId: string, target: string, value: string): Promise<void> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Typing into element "${target}": "${value}"`);
    await page.waitForSelector(target, { timeout: 15000 });
    await page.focus(target);
    await page.type(target, value, { delay: 30 });
  }

  async screenshot(sessionId: string): Promise<string> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    const buffer = await page.screenshot({ type: 'jpeg', quality: 60 });
    return Buffer.from(buffer).toString('base64');
  }

  async getInteractiveElements(sessionId: string): Promise<ExtractedElement[]> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Extracting interactive nodes from viewport`);
    
    // Evaluate in browser context to fetch visible clickable items
    const elements = await page.evaluate(() => {
      const interactables = document.querySelectorAll('a, button, input, select, textarea, [role="button"], [onclick]');
      return Array.from(interactables).map((el, index) => {
        const bounds = el.getBoundingClientRect();
        
        // Build simple CSS selector
        let selector = el.tagName.toLowerCase();
        if (el.id) selector += `#${el.id}`;
        else if (el.className) {
          const firstClass = el.className.split(' ')[0];
          if (firstClass && typeof firstClass === 'string' && !firstClass.includes(':')) {
            selector += `.${firstClass}`;
          }
        }

        return {
          id: `node_${index}`,
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 50) || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          bounds: {
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
          selector,
        };
      }).filter((item) => item.bounds.width > 0 && item.bounds.height > 0);
    });

    return elements;
  }

  async close(sessionId: string): Promise<void> {
    const browser = this.activeBrowsers.get(sessionId);
    if (browser) {
      await browser.close().catch(() => {});
      this.activeBrowsers.delete(sessionId);
      this.activePages.delete(sessionId);
    }
  }

  async getCookies(sessionId: string): Promise<any[]> {
    const page = this.activePages.get(sessionId);
    if (!page) return [];
    return page.cookies();
  }

  async setCookies(sessionId: string, cookies: any[]): Promise<void> {
    const page = this.activePages.get(sessionId);
    if (!page) return;
    await page.setCookie(...cookies);
  }
}
