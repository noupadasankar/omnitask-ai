import { z } from 'zod';

export const PlanStepSchema = z.object({
  id: z.string(),
  description: z.string(),
  type: z.string(),
  action: z.string(),
  selectors: z.array(z.object({
    type: z.enum(['css', 'xpath', 'text', 'aria-label']),
    value: z.string(),
  })).optional(),
  params: z.any().optional(),
  expectedOutcome: z.string().optional(),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
  requiresApproval: z.boolean().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  hash: z.string(),
  rawOutput: z.string(),
  steps: z.array(PlanStepSchema),
  validated: z.boolean(),
  repaired: z.boolean().optional(),
  model: z.string(),
  tokensUsed: z.number().optional(),
  createdAt: z.date(),
});

export type Plan = z.infer<typeof PlanSchema>;

export const CreatePlanDtoSchema = z.object({
  naturalLanguage: z.string().min(1),
  context: z.any().optional(),
});

export type CreatePlanDto = z.infer<typeof CreatePlanDtoSchema>;

export const ValidatedPlanSchema = PlanSchema.extend({
  riskScore: z.number(),
  validated: z.literal(true),
});

export type ValidatedPlan = z.infer<typeof ValidatedPlanSchema>;