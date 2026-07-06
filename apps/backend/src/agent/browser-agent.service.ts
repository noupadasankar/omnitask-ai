// backend/src/agent/browser-agent.service.ts

import { Injectable, Logger, OnModuleDestroy, Inject, forwardRef } from '@nestjs/common';
import * as fs from 'fs';
import { ConfigService } from '@nestjs/config';
import { chromium, Browser, BrowserContext, Page } from 'playwright';
import {
  BrowserSessionConfig,
  DEFAULT_BROWSER_CONFIG,
  BrowserAction,
} from '../shared/interfaces/agent.interfaces';
import { BrowserSessionService } from './browser-session.service';
import { SessionManagerService } from './runtime/session-manager.service';


export interface BrowserSession {
  id: string;
  browser: Browser;
  context: BrowserContext;
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

  constructor(
    private configService: ConfigService,
    private sessionService: BrowserSessionService,
    // The inline browser runtime owns its browser:state lifecycle.
    @Inject(forwardRef(() => SessionManagerService))
    private sessionManager: SessionManagerService,
  ) {}

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
    // Runtime owns browser:state. Chromium is launching now.
    if (this.sessionManager.get(sessionId)) {
      this.sessionManager.transitionBrowserState(sessionId, 'INITIALIZING');
    }

    const userId = (config as any).userId || 'system';
    
    // Delegate browser launch to BrowserSessionService
    const launchSession = await this.sessionService.createSession(sessionId, userId, {
      headless: mergedConfig.headless,
      width: mergedConfig.viewport.width,
      height: mergedConfig.viewport.height,
      // Playwright fixes the user-agent at context creation — it can't be
      // changed per-page afterwards, so we pass it through here.
      userAgent: mergedConfig.userAgent,
    });

    const page = launchSession.pages[launchSession.activePageIndex];

    await this.injectAntiDetection(launchSession.context);

    const session: BrowserSession = {
      id: sessionId,
      browser: launchSession.browser,
      context: launchSession.context,
      page,
      config: mergedConfig,
      isActive: true,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.sessions.set(sessionId, session);
    this.logger.log(`Browser session created: ${sessionId}`);
    // Chromium is up at about:blank — observer can attach. Not RUNNING yet:
    // the streamer declares RUNNING on the first real frame.
    if (this.sessionManager.get(sessionId)) {
      this.sessionManager.transitionBrowserState(sessionId, 'READY');
    }

    return session;
  }

  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      session.isActive = false;
      await this.sessionService.closeSession(sessionId);
      this.sessions.delete(sessionId);
      // Runtime confirms the browser is gone.
      if (this.sessionManager.get(sessionId)) {
        this.sessionManager.transitionBrowserState(sessionId, 'STOPPED');
      }
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
            waitUntil: 'networkidle',
            timeout: session.config.timeout,
          });
          return { success: true, result: { url: page.url() } };

        case 'click':
          await this.safeClick(page, target!);
          return { success: true };

        case 'double_click':
          const dcElement = await page.waitForSelector(target!, { timeout: 10000 });
          if (dcElement) {
            await dcElement.click({ clickCount: 2 });
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
          await page.selectOption(target!, value!);
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
            await fileInput.setInputFiles(value!);
          }
          return { success: true };

        case 'switch_tab':
          const pages = session.context.pages();
          const tabIndex = parseInt(value || '0', 10);
          if (pages[tabIndex]) {
            session.page = pages[tabIndex];
            await pages[tabIndex].bringToFront();
          }
          return { success: true };

        case 'close_tab':
          const currentPages = session.context.pages();
          if (currentPages.length > 1) {
            await page.close();
            session.page = currentPages[currentPages.length - 2];
          }
          return { success: true };

        case 'go_back':
          await page.goBack({ waitUntil: 'networkidle' });
          return { success: true };

        case 'go_forward':
          await page.goForward({ waitUntil: 'networkidle' });
          return { success: true };

        case 'refresh':
          await page.reload({ waitUntil: 'networkidle' });
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

  async executeSkill(
    sessionId: string,
    skillName: string,
    args: any,
  ): Promise<{
    success: boolean;
    screenshot: string | null;
    data?: any;
    requiresApproval?: boolean;
    error?: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      return { success: false, screenshot: null, error: 'Session not found or inactive' };
    }

    session.lastActivityAt = new Date();
    const page = session.page;
    this.logger.log(`Executing Skill [${skillName}] with args: ${JSON.stringify(args)}`);

    try {
      let success = false;
      let data: any = undefined;
      let error: string | undefined = undefined;

      switch (skillName) {
        case 'open_site': {
          const { url } = args;
          await page.goto(url, {
            waitUntil: 'networkidle',
            timeout: session.config.timeout,
          });
          success = true;
          data = { url: page.url() };
          break;
        }

        case 'search_google': {
          const { query } = args;
          await page.goto('https://www.google.com', {
            waitUntil: 'networkidle',
            timeout: session.config.timeout,
          });
          
          let searchSelector = 'textarea[name="q"]';
          try {
            await page.waitForSelector(searchSelector, { state: 'visible', timeout: 5000 });
          } catch {
            searchSelector = 'input[name="q"]';
            await page.waitForSelector(searchSelector, { state: 'visible', timeout: 5000 });
          }

          await this.safeType(page, searchSelector, query);
          await page.keyboard.press('Enter');
          await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
          success = true;
          break;
        }

        case 'click_element': {
          const { selector } = args;
          await this.safeClick(page, selector);
          success = true;
          break;
        }

        case 'fill_input': {
          const { selector, text } = args;
          
          const isBlockedInput = await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            if (!el) return { blocked: false, type: '' };
            const type = (el.getAttribute('type') || '').toLowerCase();
            const name = (el.getAttribute('name') || '').toLowerCase();
            const id = (el.getAttribute('id') || '').toLowerCase();
            const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
            const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
            const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();

            // Heuristics for password
            if (
              type === 'password' ||
              name.includes('password') ||
              id.includes('password') ||
              autocomplete.includes('password')
            ) {
              return { blocked: true, type: 'password' };
            }

            // Heuristics for OTP/verification code
            const otpKeywords = ['otp', 'one-time', 'verification', 'code', 'security-code', 'passcode', '2fa', 'mfa'];
            if (
              otpKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw) || ariaLabel.includes(kw))
            ) {
              return { blocked: true, type: 'otp' };
            }

            // Heuristics for Credit Card number, CVV, Expiry
            const ccKeywords = [
              'card-number', 'cardnumber', 'creditcard', 'debitcard', 'cc-num', 'ccnum', 'cvv', 'cvc', 'security-code', 
              'expiry', 'expiration', 'cc-exp', 'ccexp'
            ];
            if (
              ccKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw) || ariaLabel.includes(kw))
            ) {
              return { blocked: true, type: 'payment' };
            }

            return { blocked: false, type: '' };
          }, selector);

          if (isBlockedInput.blocked) {
            error = `Auto-filling sensitive ${isBlockedInput.type} fields is blocked by safety policy.`;
            this.logger.warn(`Security Warning: Blocked auto-fill of sensitive ${isBlockedInput.type} field in selector: ${selector}`);
            return {
              success: false,
              screenshot: await this.takeScreenshot(sessionId),
              requiresApproval: true,
              error,
            };
          }

          await this.safeType(page, selector, text);
          success = true;
          break;
        }

        case 'scroll_page': {
          const { pixels } = args;
          const scrollAmount = parseInt(String(pixels || '500'), 10);
          await page.evaluate((amount) => window.scrollBy(0, amount), scrollAmount);
          success = true;
          break;
        }

        case 'wait_for_element': {
          const { selector, timeoutMs } = args;
          const timeout = parseInt(String(timeoutMs || '10000'), 10);
          await page.waitForSelector(selector, { state: 'visible', timeout });
          success = true;
          break;
        }

        case 'extract_text': {
          const { selector } = args;
          let extractedText = '';
          if (selector) {
            extractedText = await page.$eval(selector, (el) => el.textContent?.trim() || '');
          } else {
            extractedText = await page.evaluate(() => document.body.textContent?.trim() || '');
          }
          success = true;
          data = { text: extractedText };
          break;
        }

        case 'detect_login': {
          const loginDetection = await page.evaluate(() => {
            const textContent = document.body.textContent?.toLowerCase() || '';
            const inputs = Array.from(document.querySelectorAll('input'));
            const passwordInputs = inputs.filter(i => i.getAttribute('type') === 'password');
            const emailInputs = inputs.filter(i => {
              const type = i.getAttribute('type') || '';
              const name = i.getAttribute('name') || '';
              return type === 'email' || name.includes('email') || name.includes('username');
            });

            let confidence = 0.0;
            let reasons: string[] = [];

            if (passwordInputs.length > 0) {
              confidence += 0.5;
              reasons.push('Password input element found');
            }
            if (emailInputs.length > 0) {
              confidence += 0.3;
              reasons.push('Email or username input element found');
            }

            const loginKeywords = [
              'sign in', 'log in', 'signin', 'login', 'continue with google',
              'google login', 'sign into', 'sign-in', 'log-in'
            ];

            const foundKeyword = loginKeywords.find(kw => textContent.includes(kw));
            if (foundKeyword) {
              confidence += 0.2;
              reasons.push(`Login keyword found: "${foundKeyword}"`);
            }

            const buttons = Array.from(document.querySelectorAll('button, a, input[type="submit"]'));
            const loginButtons = buttons.filter(btn => {
              const btnText = btn.textContent?.toLowerCase() || '';
              const btnVal = (btn as any).value?.toLowerCase() || '';
              return loginKeywords.some(kw => btnText.includes(kw) || btnVal.includes(kw));
            });

            if (loginButtons.length > 0) {
              confidence += 0.2;
              reasons.push('Login/Sign-in button found');
            }

            confidence = Math.min(confidence, 1.0);
            return { detected: confidence >= 0.5, confidence, reasons };
          });

          success = true;
          data = loginDetection;
          break;
        }

        case 'detect_payment': {
          const paymentDetection = await page.evaluate(() => {
            const textContent = document.body.textContent?.toLowerCase() || '';
            const inputs = Array.from(document.querySelectorAll('input'));
            
            let confidence = 0.0;
            let reasons: string[] = [];

            const ccKeywords = ['card number', 'cardnumber', 'credit card', 'debit card', 'visa', 'mastercard', 'amex'];
            const cvvKeywords = ['cvv', 'cvc', 'security code', 'card security'];
            const expiryKeywords = ['exp', 'expiry', 'expiration'];
            const paymentKeywords = ['payment', 'checkout', 'pay now', 'place order', 'buy now', 'order total'];

            const hasCCInput = inputs.some(i => {
              const name = (i.getAttribute('name') || '').toLowerCase();
              const id = (i.getAttribute('id') || '').toLowerCase();
              const placeholder = (i.getAttribute('placeholder') || '').toLowerCase();
              const autocomplete = (i.getAttribute('autocomplete') || '').toLowerCase();
              
              return ccKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw) || autocomplete.includes(kw));
            });

            const hasCVVInput = inputs.some(i => {
              const name = (i.getAttribute('name') || '').toLowerCase();
              const id = (i.getAttribute('id') || '').toLowerCase();
              const placeholder = (i.getAttribute('placeholder') || '').toLowerCase();
              
              return cvvKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw));
            });

            const hasExpiryInput = inputs.some(i => {
              const name = (i.getAttribute('name') || '').toLowerCase();
              const id = (i.getAttribute('id') || '').toLowerCase();
              const placeholder = (i.getAttribute('placeholder') || '').toLowerCase();
              
              return expiryKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw));
            });

            if (hasCCInput) {
              confidence += 0.5;
              reasons.push('Credit/debit card number input detected');
            }
            if (hasCVVInput) {
              confidence += 0.2;
              reasons.push('CVV/security code input detected');
            }
            if (hasExpiryInput) {
              confidence += 0.2;
              reasons.push('Expiry date input detected');
            }

            const foundKeyword = paymentKeywords.find(kw => textContent.includes(kw));
            if (foundKeyword) {
              confidence += 0.2;
              reasons.push(`Payment keyword found: "${foundKeyword}"`);
            }

            confidence = Math.min(confidence, 1.0);
            return { detected: confidence >= 0.5, confidence, reasons };
          });

          success = true;
          data = paymentDetection;
          break;
        }

        case 'detect_otp': {
          const otpDetection = await page.evaluate(() => {
            const textContent = document.body.textContent?.toLowerCase() || '';
            const inputs = Array.from(document.querySelectorAll('input'));

            let confidence = 0.0;
            let reasons: string[] = [];

            const otpKeywords = ['otp', 'one-time', 'one time', 'verification code', 'enter code', 'sms code', 'verify phone', 'verify email'];
            
            const hasOTPInput = inputs.some(i => {
              const name = (i.getAttribute('name') || '').toLowerCase();
              const id = (i.getAttribute('id') || '').toLowerCase();
              const placeholder = (i.getAttribute('placeholder') || '').toLowerCase();
              
              return otpKeywords.some(kw => name.includes(kw) || id.includes(kw) || placeholder.includes(kw));
            });

            if (hasOTPInput) {
              confidence += 0.6;
              reasons.push('OTP/Verification code input detected');
            }

            const foundKeyword = otpKeywords.find(kw => textContent.includes(kw));
            if (foundKeyword) {
              confidence += 0.3;
              reasons.push(`OTP keyword found: "${foundKeyword}"`);
            }

            confidence = Math.min(confidence, 1.0);
            return { detected: confidence >= 0.5, confidence, reasons };
          });

          success = true;
          data = otpDetection;
          break;
        }

        case 'detect_captcha': {
          const captchaDetection = await page.evaluate(() => {
            const textContent = document.body.textContent?.toLowerCase() || '';
            const iframes = Array.from(document.querySelectorAll('iframe'));
            
            let confidence = 0.0;
            let reasons: string[] = [];

            const hasCaptchaIframe = iframes.some(iframe => {
              const src = (iframe.getAttribute('src') || '').toLowerCase();
              return (
                src.includes('recaptcha') ||
                src.includes('hcaptcha') ||
                src.includes('arkoselabs') ||
                src.includes('turnstile') ||
                src.includes('challenges.cloudflare.com')
              );
            });

            if (hasCaptchaIframe) {
              confidence += 0.7;
              reasons.push('CAPTCHA iframe (reCAPTCHA, hCaptcha, Turnstile) detected');
            }

            const captchaKeywords = ['captcha', 'recaptcha', 'hcaptcha', 'prove you are human', 'verify you are human', 'security check', 'robot check'];
            const foundKeyword = captchaKeywords.find(kw => textContent.includes(kw));
            if (foundKeyword) {
              confidence += 0.2;
              reasons.push(`CAPTCHA keyword found: "${foundKeyword}"`);
            }

            const selectorKeywords = ['.g-recaptcha', '#g-recaptcha', '#recaptcha', '.h-captcha', '#cf-turnstile', '.cf-turnstile'];
            const hasSelector = selectorKeywords.some(sel => document.querySelector(sel) !== null);
            if (hasSelector) {
              confidence += 0.3;
              reasons.push('CAPTCHA DOM container element found');
            }

            confidence = Math.min(confidence, 1.0);
            return { detected: confidence >= 0.5, confidence, reasons };
          });

          success = true;
          data = captchaDetection;
          break;
        }

        case 'upload_file': {
          const { selector, filePath } = args;
          
          if (!fs.existsSync(filePath)) {
            error = `File not found on disk: ${filePath}`;
            this.logger.warn(error);
            return {
              success: false,
              screenshot: await this.takeScreenshot(sessionId),
              error,
            };
          }

          const fileInput = await page.waitForSelector(selector);
          if (fileInput) {
            await fileInput.setInputFiles(filePath);
            success = true;
          } else {
            error = `File input element not found for selector: ${selector}`;
          }
          break;
        }

        default:
          return { success: false, screenshot: null, error: `Unknown skill: ${skillName}` };
      }

      const screenshot = await this.takeScreenshot(sessionId);
      return { success, screenshot, data, error };
    } catch (err: any) {
      this.logger.error(`Skill failed [${skillName}] on session ${sessionId}: ${err.message}`);
      return {
        success: false,
        screenshot: await this.takeScreenshot(sessionId),
        error: err.message,
      };
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
      viewport: session.page.viewportSize()!,
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

  getCurrentUrl(sessionId: string): string | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    try {
      return session.page.url();
    } catch {
      return null;
    }
  }

  // ─── Helper Methods ──────────────────────────────────────────

  private async safeClick(page: Page, selector: string): Promise<void> {
    try {
      await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
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
    const element = await page.waitForSelector(selector, { state: 'visible', timeout: 10000 });
    if (!element) throw new Error(`Input not found: ${selector}`);

    await element.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');

    for (const char of text) {
      await page.keyboard.type(char, { delay: 30 + Math.random() * 70 });
    }
  }

  private async injectAntiDetection(context: BrowserContext): Promise<void> {
    await context.addInitScript(() => {
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
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    const originalClose = page.close.bind(page);
    page.close = async () => {
      await originalClose();
      await browser.close();
    };
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
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
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();
    try {
      await page.goto(`https://www.google.com/search?q=${encodeURIComponent(query)}`, {
        waitUntil: 'networkidle',
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
