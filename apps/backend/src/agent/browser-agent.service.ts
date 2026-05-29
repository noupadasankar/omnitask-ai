// backend/src/agent/browser-agent.service.ts

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page, ElementHandle } from 'puppeteer';
import {
  BrowserSessionConfig,
  DEFAULT_BROWSER_CONFIG,
  BrowserAction,
} from '../shared/interfaces/agent.interfaces';

puppeteer.use(StealthPlugin());

export interface BrowserSession {
  id: string;
  browser: Browser;
  page: Page;
  config: BrowserSessionConfig;
  isActive: boolean;
  createdAt: Date;
  lastActivityAt: Date;
}

@Injectable()
export class BrowserAgentService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserAgentService.name);
  private sessions = new Map<string, BrowserSession>();

  constructor(private configService: ConfigService) {}

  async onModuleDestroy() {
    for (const [id, session] of this.sessions) {
      await this.closeSession(id);
    }
  }

  // ─── Session Lifecycle ───────────────────────────────────

  async createSession(
    sessionId: string,
    config: Partial<BrowserSessionConfig> = {},
  ): Promise<BrowserSession> {
    const mergedConfig: BrowserSessionConfig = {
      ...DEFAULT_BROWSER_CONFIG,
      ...config,
    };

    this.logger.log(`Creating browser session: ${sessionId}`);

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      `--window-size=${mergedConfig.viewport.width},${mergedConfig.viewport.height}`,
    ];

    if (mergedConfig.proxy) {
      launchArgs.push(`--proxy-server=${mergedConfig.proxy.server}`);
    }

    const browser = await puppeteer.launch({
      headless: mergedConfig.headless,
      args: launchArgs,
      defaultViewport: mergedConfig.viewport,
    });

    const page = await browser.newPage();

    if (mergedConfig.userAgent) {
      await page.setUserAgent(mergedConfig.userAgent);
    }

    await page.setViewport(mergedConfig.viewport);

    if (mergedConfig.proxy?.username) {
      await page.authenticate({
        username: mergedConfig.proxy.username,
        password: mergedConfig.proxy.password || '',
      });
    }

    await this.injectAntiDetection(page);

    const session: BrowserSession = {
      id: sessionId,
      browser,
      page,
      config: mergedConfig,
      isActive: true,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`Browser session created: ${sessionId}`);

    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.isActive = false;
      await session.page.close().catch(() => {});
      await session.browser.close().catch(() => {});
      this.sessions.delete(sessionId);
      this.logger.log(`Browser session closed: ${sessionId}`);
    } catch (error) {
      this.logger.error(`Error closing session ${sessionId}:`, error);
    }
  }

  getSession(sessionId: string): BrowserSession | undefined {
    return this.sessions.get(sessionId);
  }

  // ─── Browser Actions ────────────────────────────────────

  async executeAction(
    sessionId: string,
    action: BrowserAction,
    target?: string,
    value?: string,
  ): Promise<{ success: boolean; result?: any; error?: string }> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return { success: false, error: 'Session not found or inactive' };
    }

    session.lastActivityAt = new Date();
    const page = session.page;

    try {
      switch (action) {
        case 'navigate':
          await page.goto(value!, {
            waitUntil: 'networkidle2',
            timeout: session.config.timeout,
          });
          return { success: true, result: { url: page.url() } };

        case 'click':
          await this.safeClick(page, target!);
          return { success: true };

        case 'double_click':
          const dcElement = await page.waitForSelector(target!, { timeout: 10000 });
          if (dcElement) {
            await dcElement.click({ count: 2 });
          }
          return { success: true };

        case 'right_click':
          const rcElement = await page.waitForSelector(target!, { timeout: 10000 });
          if (rcElement) {
            await rcElement.click({ button: 'right' });
          }
          return { success: true };

        case 'type':
          await this.safeType(page, target!, value!);
          return { success: true };

        case 'select':
          await page.select(target!, value!);
          return { success: true };

        case 'scroll':
          const scrollAmount = parseInt(value || '500', 10);
          await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
          return { success: true };

        case 'hover':
          await page.hover(target!);
          return { success: true };

        case 'press_key':
          await page.keyboard.press(value as any);
          return { success: true };

        case 'wait':
          const waitMs = parseInt(value || '1000', 10);
          await new Promise((res) => setTimeout(res, waitMs));
          return { success: true };

        case 'screenshot':
          const screenshot = await this.takeScreenshot(sessionId);
          return { success: true, result: { screenshot } };

        case 'extract_text':
          const text = await page.$eval(target!, (el) => el.textContent?.trim() || '');
          return { success: true, result: { text } };

        case 'extract_data':
          const data = await page.evaluate((selector) => {
            const elements = document.querySelectorAll(selector);
            return Array.from(elements).map((el) => ({
              text: el.textContent?.trim(),
              href: (el as HTMLAnchorElement).href || null,
              src: (el as HTMLImageElement).src || null,
            }));
          }, target!);
          return { success: true, result: { data } };

        case 'upload_file':
          const fileInput = await page.waitForSelector(target!);
          if (fileInput) {
            await (fileInput as ElementHandle<HTMLInputElement>).uploadFile(value!);
          }
          return { success: true };

        case 'switch_tab':
          const pages = await session.browser.pages();
          const tabIndex = parseInt(value || '0', 10);
          if (pages[tabIndex]) {
            session.page = pages[tabIndex];
            await pages[tabIndex].bringToFront();
          }
          return { success: true };

        case 'close_tab':
          const currentPages = await session.browser.pages();
          if (currentPages.length > 1) {
            await page.close();
            session.page = currentPages[currentPages.length - 2];
          }
          return { success: true };

        case 'go_back':
          await page.goBack({ waitUntil: 'networkidle2' });
          return { success: true };

        case 'go_forward':
          await page.goForward({ waitUntil: 'networkidle2' });
          return { success: true };

        case 'refresh':
          await page.reload({ waitUntil: 'networkidle2' });
          return { success: true };

        case 'evaluate':
          const evalResult = await page.evaluate(value!);
          return { success: true, result: { evalResult } };

        case 'drag_drop':
          const source = await page.waitForSelector(target!);
          const dest = await page.waitForSelector(value!);
          if (source && dest) {
            const sourceBox = await source.boundingBox();
            const destBox = await dest.boundingBox();
            if (sourceBox && destBox) {
              await page.mouse.move(
                sourceBox.x + sourceBox.width / 2,
                sourceBox.y + sourceBox.height / 2,
              );
              await page.mouse.down();
              await page.mouse.move(
                destBox.x + destBox.width / 2,
                destBox.y + destBox.height / 2,
                { steps: 10 },
              );
              await page.mouse.up();
            }
          }
          return { success: true };

        default:
          return { success: false, error: `Unknown action: ${action}` };
      }
    } catch (error: any) {
      this.logger.error(`Action failed [${action}] on session ${sessionId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // ─── Screenshot ──────────────────────────────────────────────

  async takeScreenshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return null;

    try {
      const buffer = await session.page.screenshot({
        type: 'jpeg',
        quality: 75,
        fullPage: false,
      });
      return Buffer.from(buffer).toString('base64');
    } catch (error: any) {
      this.logger.error(`Screenshot failed for session ${sessionId}: ${error.message}`);
      return null;
    }
  }

  async takeFullPageScreenshot(sessionId: string): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return null;

    try {
      const buffer = await session.page.screenshot({
        type: 'png',
        fullPage: true,
      });
      return Buffer.from(buffer).toString('base64');
    } catch (error: any) {
      this.logger.error(`Full screenshot failed: ${error.message}`);
      return null;
    }
  }

  // ─── Page Info ───────────────────────────────────────────────

  async getPageInfo(
    sessionId: string,
  ): Promise<{
    url: string;
    title: string;
    viewport: { width: number; height: number };
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return null;

    return {
      url: session.page.url(),
      title: await session.page.title(),
      viewport: session.page.viewport()!,
    };
  }

  async getPageDOM(sessionId: string, simplified = true): Promise<string | null> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) return null;

    if (simplified) {
      return await session.page.evaluate(() => {
        function simplifyDOM(element: Element, depth = 0): string {
          if (depth > 6) return '';
          const tag = element.tagName.toLowerCase();
          const interactable = ['a', 'button', 'input', 'select', 'textarea', 'label'];
          const important = ['h1', 'h2', 'h3', 'h4', 'p', 'span', 'div', 'form', 'nav', 'main'];

          if (!interactable.includes(tag) && !important.includes(tag)) {
            return Array.from(element.children)
              .map((c) => simplifyDOM(c, depth + 1))
              .join('');
          }

          const attrs: string[] = [];
          if (element.id) attrs.push(`id="${element.id}"`);
          if (element.className && typeof element.className === 'string') {
            const cls = element.className.split(' ').slice(0, 3).join(' ');
            if (cls) attrs.push(`class="${cls}"`);
          }
          if ((element as HTMLAnchorElement).href) {
            attrs.push(`href="${(element as HTMLAnchorElement).href}"`);
          }
          if ((element as HTMLInputElement).type) {
            attrs.push(`type="${(element as HTMLInputElement).type}"`);
          }
          if ((element as HTMLInputElement).name) {
            attrs.push(`name="${(element as HTMLInputElement).name}"`);
          }
          if ((element as HTMLInputElement).placeholder) {
            attrs.push(`placeholder="${(element as HTMLInputElement).placeholder}"`);
          }

          const text = element.textContent?.trim().substring(0, 80) || '';
          const children = Array.from(element.children)
            .map((c) => simplifyDOM(c, depth + 1))
            .join('');
          const indent = '  '.repeat(depth);

          if (children) {
            return `${indent}<${tag} ${attrs.join(' ')}>\n${children}${indent}</${tag}>\n`;
          }
          return `${indent}<${tag} ${attrs.join(' ')}>${text}</${tag}>\n`;
        }

        return simplifyDOM(document.body);
      });
    }

    return await session.page.content();
  }

  async getCursorPosition(sessionId: string): Promise<{ x: number; y: number } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    try {
      return await session.page.evaluate(() => {
        return { x: (window as any).__cursorX || 0, y: (window as any).__cursorY || 0 };
      });
    } catch {
      return null;
    }
  }

  // ─── Helper Methods ──────────────────────────────────────────

  private async safeClick(page: Page, selector: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { visible: true, timeout: 10000 });
      await page.click(selector);
      return;
    } catch (e) {
      this.logger.warn(`Direct click failed for "${selector}", trying alternatives...`);
    }

    try {
      await page.evaluate((sel) => {
        let el = document.querySelector(sel);
        if (el) {
          (el as HTMLElement).click();
          return;
        }
        const allElements = document.querySelectorAll('button, a, [role="button"], input[type="submit"]');
        for (const elem of allElements) {
          if (elem.textContent?.trim().toLowerCase().includes(sel.toLowerCase())) {
            (elem as HTMLElement).click();
            return;
          }
        }
        throw new Error(`Element not found: ${sel}`);
      }, selector);
    } catch (error) {
      throw new Error(`Could not click element: ${selector}`);
    }
  }

  private async safeType(page: Page, selector: string, text: string): Promise<void> {
    const element = await page.waitForSelector(selector, { visible: true, timeout: 10000 });
    if (!element) throw new Error(`Input not found: ${selector}`);

    await element.click({ count: 3 });
    await page.keyboard.press('Backspace');

    for (const char of text) {
      await page.keyboard.type(char, { delay: 30 + Math.random() * 70 });
    }
  }

  private async injectAntiDetection(page: Page): Promise<void> {
    await page.evaluateOnNewDocument(() => {
      document.addEventListener('mousemove', (e) => {
        (window as any).__cursorX = e.clientX;
        (window as any).__cursorY = e.clientY;
      });

      Object.defineProperty(navigator, 'webdriver', { get: () => false });

      (window as any).chrome = {
        runtime: {},
        loadTimes: () => {},
        csi: () => {},
        app: {},
      };

      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters: any) =>
        parameters.name === 'notifications'
          ? Promise.resolve({ state: Notification.permission } as PermissionStatus)
          : originalQuery(parameters);

      Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5],
      });

      Object.defineProperty(navigator, 'languages', {
        get: () => ['en-US', 'en'],
      });
    });
  }

  async goTo(url: string): Promise<Page> {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];
    const browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
    });
    const page = await browser.newPage();
    const originalClose = page.close.bind(page);
    page.close = async () => {
      await originalClose();
      await browser.close();
    };
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    return page;
  }

  async extractText(page: Page, selector?: string): Promise<string> {
    if (selector) {
      await page.waitForSelector(selector, { timeout: 10000 });
      return await page.$eval(selector, (el) => el.textContent?.trim() || '');
    }
    return await page.evaluate(() => document.body.textContent?.trim() || '');
  }

  async searchGoogle(query: string): Promise<any[]> {
    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ];
    const browser = await puppeteer.launch({
      headless: true,
      args: launchArgs,
    });
    const page = await browser.newPage();
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });
      const results = await page.evaluate(() => {
        const items = document.querySelectorAll('div.g');
        return Array.from(items).map((el) => {
          const titleEl = el.querySelector('h3');
          const linkEl = el.querySelector('a');
          const snippetEl = el.querySelector('div.VwiC3b');
          return {
            title: titleEl?.textContent || '',
            link: linkEl?.href || '',
            snippet: snippetEl?.textContent || '',
          };
        });
      });
      return results.slice(0, 5);
    } finally {
      await page.close();
      await browser.close();
    }
  }
}
