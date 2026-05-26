import { Injectable, Logger } from '@nestjs/common';
import puppeteer, { Browser, Page } from 'puppeteer';

@Injectable()
export class BrowserAgentService {
  private readonly logger = new Logger(BrowserAgentService.name);
  private browser: Browser | null = null;

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      this.logger.log('🌐 Browser initialized');
    }
    return this.browser;
  }

  async newPage(): Promise<Page> {
    const browser = await this.init();
    return await browser.newPage();
  }

  async goTo(url: string): Promise<Page> {
    const page = await this.newPage();
    this.logger.log(`🌐 Navigating to ${url}`);

    await page.goto(url, {
      waitUntil: 'networkidle2',
    });

    return page;
  }

  async searchGoogle(query: string): Promise<string[]> {
    const page = await this.goTo('https://www.google.com');

    await page.type('input[name="q"]', query);
    await page.keyboard.press('Enter');

    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    const results = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('h3'));
      return links.slice(0, 5).map((el) => el.textContent);
    });

    await page.close();

    return results as string[];
  }

  async clickByText(page: Page, text: string): Promise<boolean> {
    const clicked = await page.evaluate((text) => {
      const elements = Array.from(document.querySelectorAll('button,a'));
      const target = elements.find((el) =>
        el.textContent?.toLowerCase().includes(text.toLowerCase()),
      );
      if (target) {
        (target as HTMLElement).click();
        return true;
      }
      return false;
    }, text);

    return clicked;
  }

  async fillInput(page: Page, selector: string, value: string): Promise<void> {
    await page.waitForSelector(selector);
    await page.type(selector, value);
  }

  async extractText(page: Page, selector?: string): Promise<string> {
    const text = await page.evaluate((selector) => {
      if (selector) {
        const element = document.querySelector(selector);
        return element?.textContent || '';
      }
      return document.body.innerText;
    }, selector);

    return text;
  }

  async screenshot(page: Page, name = 'screen'): Promise<string> {
    const path = `./${name}.png`;
    await page.screenshot({ path });
    return path;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.logger.log('🌐 Browser closed');
    }
  }

  async closeAllPages(): Promise<void> {
    if (this.browser) {
      const pages = await this.browser.pages();
      for (const page of pages) {
        await page.close();
      }
    }
  }
}
