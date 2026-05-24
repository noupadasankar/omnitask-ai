import { Injectable, BadRequestException } from '@nestjs/common';
import { z } from 'zod';

export const ALLOWED_ACTIONS = ['navigate', 'click', 'type', 'upload', 'extract', 'wait', 'screenshot', 'scroll', 'hover', 'select', 'check', 'uncheck', 'press_key', 'evaluate'] as const;
export type AllowedAction = typeof ALLOWED_ACTIONS[number];

const PlanStepSchema = z.object({
  action: z.enum(ALLOWED_ACTIONS),
  url: z.string().url().optional(),
  selector: z.string().optional(),
  value: z.string().optional(),
  key: z.string().optional(),
  description: z.string().min(1).max(200),
  timeout: z.number().min(0).max(30000).optional().default(10000),
  optional: z.boolean().optional().default(false),
});

const ValidatedPlanSchema = z.object({
  goal: z.string().min(1).max(500),
  estimatedSteps: z.number().min(1).max(100),
  riskLevel: z.enum(['low', 'medium', 'high']),
  requiresLogin: z.boolean(),
  steps: z.array(PlanStepSchema).min(1).max(100),
});

export type ValidatedPlan = z.infer<typeof ValidatedPlanSchema>;
export type PlanStep = z.infer<typeof PlanStepSchema>;

@Injectable()
export class PlanValidator {
  validate(raw: unknown): ValidatedPlan {
    const result = ValidatedPlanSchema.safeParse(raw);
    if (!result.success) {
      throw new BadRequestException(`Plan validation failed: ${result.error.issues.map(i => i.message).join(', ')}`);
    }
    for (const step of result.data.steps) {
      if (step.selector && /[<>]/.test(step.selector)) {
        throw new BadRequestException(`Unsafe selector in step: ${step.description}`);
      }
    }
    return result.data;
  }
}