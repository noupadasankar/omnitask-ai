import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';

puppeteer.use(StealthPlugin());

export interface BrowserSessionInfo {
  sessionId: string;
  userId: string;
  browser: Browser;
  pages: Page[];
  activePageIndex: number;
  createdAt: Date;
}

@Injectable()
export class BrowserSessionService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserSessionService.name);
  private activeSessions = new Map<string, BrowserSessionInfo>();
  private readonly cookieDirectory: string;

  constructor(private configService: ConfigService) {
    this.cookieDirectory = path.join(process.cwd(), 'storage', 'cookies');
    if (!fs.existsSync(this.cookieDirectory)) {
      fs.mkdirSync(this.cookieDirectory, { recursive: true });
    }
  }

  async onModuleDestroy() {
    for (const session of this.activeSessions.values()) {
      await this.closeSession(session.sessionId);
    }
  }

  async createSession(
    sessionId: string,
    userId: string,
    config: { headless?: boolean; width?: number; height?: number } = {},
  ): Promise<BrowserSessionInfo> {
    this.logger.log(`Launching secure browser session for user ${userId}: ${sessionId}`);

    const browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--start-maximized',
        '--disable-infobars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-blink-features=AutomationControlled',
      ],
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    const sessionInfo: BrowserSessionInfo = {
      sessionId,
      userId,
      browser,
      pages: [page],
      activePageIndex: 0,
      createdAt: new Date(),
    };

    this.activeSessions.set(sessionId, sessionInfo);
    return sessionInfo;
  }

  async getSession(sessionId: string): Promise<BrowserSessionInfo | undefined> {
    return this.activeSessions.get(sessionId);
  }

  async getActivePage(sessionId: string): Promise<Page | undefined> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;
    try {
      const openPages = await session.browser.pages();
      const validPages = openPages.filter((p) => !p.isClosed());
      if (validPages.length > 0) {
        session.pages = validPages;
        if (session.activePageIndex >= validPages.length) {
          session.activePageIndex = validPages.length - 1;
        }
        return validPages[session.activePageIndex];
      }
    } catch (error: any) {
      this.logger.error(`Error recovering active page: ${error.message}`);
    }
    return session.pages[session.activePageIndex];
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    this.logger.log(`Closing browser session: ${sessionId}`);
    try {
      // Save cookies before closing
      const page = session.pages[session.activePageIndex];
      if (page) {
        await this.persistCookies(sessionId);
      }

      await session.browser.close();
      this.activeSessions.delete(sessionId);
    } catch (error: any) {
      this.logger.error(`Error closing session ${sessionId}: ${error.message}`);
    }
  }

  // ─── Tab Management ──────────────────────────────────────

  async openNewTab(sessionId: string, url?: string): Promise<Page> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const page = await session.browser.newPage();
    session.pages.push(page);
    session.activePageIndex = session.pages.length - 1;

    if (url) {
      await page.goto(url, { waitUntil: 'networkidle2' });
    }

    return page;
  }

  async switchTab(sessionId: string, index: number): Promise<Page> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (index < 0 || index >= session.pages.length) {
      throw new Error(`Invalid tab index ${index}`);
    }

    session.activePageIndex = index;
    const page = session.pages[index];
    await page.bringToFront();
    return page;
  }

  async closeTab(sessionId: string, index: number): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);
    if (session.pages.length <= 1) {
      throw new Error(`Cannot close the last remaining tab`);
    }

    const pageToClose = session.pages[index];
    await pageToClose.close();

    session.pages.splice(index, 1);
    if (session.activePageIndex >= session.pages.length) {
      session.activePageIndex = session.pages.length - 1;
    }
  }

  // ─── Persistence (Cookies & Login State) ─────────────────

  private getCookieFilePath(userId: string, domain: string): string {
    const safeDomain = domain.replace(/[^a-zA-Z0-9.-]/g, '_');
    return path.join(this.cookieDirectory, `user_${userId}_site_${safeDomain}.json`);
  }

  async loadCookies(sessionId: string, domain: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const filePath = this.getCookieFilePath(session.userId, domain);
    if (!fs.existsSync(filePath)) return;

    try {
      this.logger.log(`Restoring session cookies for user ${session.userId} on ${domain}`);
      const cookiesJson = fs.readFileSync(filePath, 'utf8');
      const cookies = JSON.parse(cookiesJson);
      const page = session.pages[session.activePageIndex];
      await page.setCookie(...cookies);
    } catch (error: any) {
      this.logger.error(`Failed to load cookies: ${error.message}`);
    }
  }

  async persistCookies(sessionId: string): Promise<void> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    const page = session.pages[session.activePageIndex];
    if (!page) return;

    try {
      const url = page.url();
      if (!url || url.startsWith('chrome://') || url.startsWith('about:')) return;

      const parsedUrl = new URL(url);
      const domain = parsedUrl.hostname;
      const cookies = await page.cookies();

      if (cookies.length === 0) return;

      const filePath = this.getCookieFilePath(session.userId, domain);
      this.logger.log(`Persisting secure session cookies for user ${session.userId} on ${domain}`);
      fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2), 'utf8');
    } catch (error: any) {
      this.logger.error(`Failed to persist cookies: ${error.message}`);
    }
  }

  // ─── Screenshot Streaming ───────────────────────────────

  async captureScreenshotBase64(sessionId: string): Promise<string | undefined> {
    const session = this.activeSessions.get(sessionId);
    if (!session) return undefined;

    const page = session.pages[session.activePageIndex];
    if (!page) return undefined;

    try {
      const buffer = await page.screenshot({ type: 'jpeg', quality: 60 });
      return Buffer.from(buffer).toString('base64');
    } catch {
      return undefined;
    }
  }
}
