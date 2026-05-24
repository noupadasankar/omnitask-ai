import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { chromium, Browser, BrowserContext } from 'playwright';

interface ContextEntry { context: BrowserContext; createdAt: Date; lastUsedAt: Date; activeTasks: number; }

@Injectable()
export class BrowserPoolService implements OnModuleDestroy {
  private readonly logger = new Logger(BrowserPoolService.name);
  private browser: Browser | null = null;
  private readonly contexts = new Map<string, ContextEntry>();
  private readonly MAX_CONTEXT_AGE_MS = 30 * 60 * 1000;

  async getBrowser(): Promise<Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      this.logger.log('Launching Chromium...');
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      });
    }
    return this.browser;
  }

  async getContext(userId: string): Promise<BrowserContext> {
    const existing = this.contexts.get(userId);
    if (existing) {
      existing.lastUsedAt = new Date();
      existing.activeTasks++;
      return existing.context;
    }

    const browser = await this.getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      locale: 'en-US',
    });

    await context.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ico}', route => route.abort());
    await context.route(/analytics|tracking|advertisement/, route => route.abort());

    this.contexts.set(userId, { context, createdAt: new Date(), lastUsedAt: new Date(), activeTasks: 1 });
    return context;
  }

  async newPage(userId: string) {
    const context = await this.getContext(userId);
    const page = await context.newPage();
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    return page;
  }

  async releaseContext(userId: string): Promise<void> {
    const entry = this.contexts.get(userId);
    if (!entry) return;
    entry.activeTasks = Math.max(0, entry.activeTasks - 1);
  }

  async onModuleDestroy() {
    for (const entry of this.contexts.values()) {
      try { await entry.context.close(); } catch {}
    }
    if (this.browser) try { await this.browser.close(); } catch {}
  }
}