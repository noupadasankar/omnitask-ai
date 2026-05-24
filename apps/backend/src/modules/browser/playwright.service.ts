import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { PlanStep } from '../planning/plan-validator';

export interface StepResult { success: boolean; data?: any; error?: string; duration: number; }

@Injectable()
export class PlaywrightService {
  private readonly logger = new Logger(PlaywrightService.name);

  async executeStep(page: Page, step: PlanStep): Promise<StepResult> {
    const start = Date.now();
    try {
      let data: any;
      switch (step.action) {
        case 'navigate':
          await page.goto(step.url!, { waitUntil: 'domcontentloaded', timeout: step.timeout });
          break;
        case 'click':
          await page.locator(step.selector!).first().click({ timeout: step.timeout });
          break;
        case 'type':
          await page.locator(step.selector!).first().clear();
          await page.locator(step.selector!).first().fill(step.value!, { timeout: step.timeout });
          break;
        case 'upload':
          await page.locator(step.selector!).first().setInputFiles(step.value!, { timeout: step.timeout });
          break;
        case 'extract':
          data = await page.locator(step.selector!).allTextContents();
          break;
        case 'wait':
          if (step.selector) await page.locator(step.selector).first().waitFor({ state: 'visible', timeout: step.timeout });
          else await page.waitForTimeout(parseInt(step.value ?? '2000'));
          break;
        case 'screenshot':
          data = await page.screenshot({ fullPage: true, type: 'png' });
          break;
        case 'scroll':
          await page.evaluate((val) => window.scrollBy(0, parseInt(val ?? '500')), step.value);
          break;
        case 'hover':
          await page.locator(step.selector!).first().hover({ timeout: step.timeout });
          break;
        case 'select':
          await page.locator(step.selector!).selectOption(step.value!, { timeout: step.timeout });
          break;
        case 'check':
          await page.locator(step.selector!).first().check({ timeout: step.timeout });
          break;
        case 'uncheck':
          await page.locator(step.selector!).first().uncheck({ timeout: step.timeout });
          break;
        case 'press_key':
          await page.keyboard.press(step.key!);
          break;
        case 'evaluate':
          data = await page.evaluate(step.value!);
          break;
      }
      return { success: true, data, duration: Date.now() - start };
    } catch (err: any) {
      return { success: false, error: err.message, duration: Date.now() - start };
    }
  }
}