import { Injectable, Logger } from '@nestjs/common';
import { Page } from 'playwright';
import { PlanStep } from '../planning/plan-validator';
import { RetryService } from './retry.service';
import { PlanningService } from '../planning/planning.service';

export interface StepResult { success: boolean; data?: any; error?: string; duration: number; }

@Injectable()
export class RetryService {
  private readonly logger = new Logger(RetryService.name);

  async withRetry(fn: () => Promise<StepResult>, opts: { step: PlanStep; maxAttempts?: number }): Promise<StepResult> {
    const { maxAttempts = 3, step } = opts;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const result = await fn();
      if (result.success) return result;
      this.logger.warn(`Step "${step.description}" attempt ${attempt}/${maxAttempts} failed`);
      if (attempt < maxAttempts) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
    return { success: false, error: `Failed after ${maxAttempts} attempts`, duration: 0 };
  }
}