import { Injectable, Logger } from '@nestjs/common';
import { BrowserProvider, ExtractedElement } from './browser-provider.interface';
import { chromium, Browser, BrowserContext, Page } from 'playwright';

const STEALTH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
];

@Injectable()
export class PlaywrightProvider implements BrowserProvider {
  private readonly logger = new Logger(PlaywrightProvider.name);
  private activeBrowsers = new Map<string, Browser>();
  private activeContexts = new Map<string, BrowserContext>();
  private activePages = new Map<string, Page>();

  async launch(
    sessionId: string,
    userId: string,
    config: { headless?: boolean; width?: number; height?: number } = {},
  ): Promise<void> {
    this.logger.log(`Launching Playwright/Chromium for session: ${sessionId}`);
    const width = config.width || 1280;
    const height = config.height || 720;

    const browser = await chromium.launch({
      headless: config.headless !== false,
      args: [...STEALTH_ARGS, `--window-size=${width},${height}`],
    });

    const context = await browser.newContext({
      viewport: { width, height },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    });

    // Suppress navigator.webdriver flag (basic stealth)
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();

    this.activeBrowsers.set(sessionId, browser);
    this.activeContexts.set(sessionId, context);
    this.activePages.set(sessionId, page);
  }

  async navigate(sessionId: string, url: string): Promise<string> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Navigating to URL: ${url}`);
    await page.goto(url, { waitUntil: 'networkidle' });
    return page.url();
  }

  async click(sessionId: string, target: string): Promise<void> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Clicking element: "${target}"`);
    await page.waitForSelector(target, { state: 'visible', timeout: 15000 });
    await page.click(target);
  }

  async type(sessionId: string, target: string, value: string): Promise<void> {
    const page = this.activePages.get(sessionId);
    if (!page) throw new Error(`Active page not found for session ${sessionId}`);

    this.logger.log(`Typing into element "${target}": "${value}"`);
    await page.waitForSelector(target, { state: 'visible', timeout: 15000 });
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
    const elements = await page.evaluate(() => {
      const interactables = document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [onclick]',
      );
      return Array.from(interactables).map((el, index) => {
        const bounds = el.getBoundingClientRect();
        let selector = el.tagName.toLowerCase();
        if (el.id) selector += `#${el.id}`;
        else if (el.className) {
          const firstClass = String(el.className).split(' ')[0];
          if (firstClass && !firstClass.includes(':')) selector += `.${firstClass}`;
        }
        return {
          id: `node_${index}`,
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          text: el.textContent?.trim().slice(0, 50) || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
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
      this.activeContexts.delete(sessionId);
      this.activePages.delete(sessionId);
    }
  }

  async getCookies(sessionId: string): Promise<any[]> {
    const ctx = this.activeContexts.get(sessionId);
    if (!ctx) return [];
    return ctx.cookies();
  }

  async setCookies(sessionId: string, cookies: any[]): Promise<void> {
    const ctx = this.activeContexts.get(sessionId);
    if (!ctx) return;
    await ctx.addCookies(cookies);
  }
}
