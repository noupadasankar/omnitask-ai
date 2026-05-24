import { Injectable } from '@nestjs/common';
import { Page } from 'playwright';

@Injectable()
export class CaptchaDetector {
  async detect(page: Page): Promise<'recaptcha' | 'hcaptcha' | 'cloudflare' | 'none'> {
    const html = await page.content();
    if (html.includes('g-recaptcha') || html.includes('grecaptcha')) return 'recaptcha';
    if (html.includes('h-captcha') || html.includes('hcaptcha')) return 'hcaptcha';
    if (html.includes('cf-challenge') || html.includes('Cloudflare')) return 'cloudflare';
    return 'none';
  }

  async requiresApproval(page: Page): Promise<{ required: boolean; reason: string }> {
    const [captcha, isLogin, isPayment] = await Promise.all([
      this.detect(page),
      page.locator('input[type="password"]').count().then(c => c > 0),
      page.evaluate(() => /credit.card|payment|checkout|billing/i.test(document.body.innerHTML)).then(r => r),
    ]);
    if (captcha !== 'none') return { required: true, reason: `CAPTCHA detected: ${captcha}` };
    if (isPayment) return { required: true, reason: 'Payment page detected' };
    return { required: false, reason: '' };
  }
}