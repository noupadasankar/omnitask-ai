import { z } from 'zod';
import { CronExpressionParser } from 'cron-parser';

export const OrchestrateSchema = z.object({
  goal: z.string().min(1, 'Goal is required').max(2000),
});

export type OrchestrateDto = z.infer<typeof OrchestrateSchema>;

export const ClarifySchema = z.object({
  goal: z.string().min(1, 'Goal is required').max(2000),
});

export type ClarifyDto = z.infer<typeof ClarifySchema>;

export const RefineGoalSchema = z.object({
  currentGoal: z.object({
    taskType: z.string(),
    intent: z.string().max(2000),
    entities: z.record(z.unknown()),
    constraints: z.array(z.string()),
    preferredWebsites: z.array(z.string()),
    estimatedComplexity: z.enum(['simple', 'moderate', 'complex']),
    requiresPayment: z.boolean(),
    requiresLogin: z.boolean(),
    sensitiveData: z.boolean(),
    ambiguityScore: z.number().min(0).max(1),
    clarifyingQuestions: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  userFeedback: z.string().min(1, 'Feedback is required').max(2000),
});

export type RefineGoalDto = z.infer<typeof RefineGoalSchema>;

// Agent endpoint schemas (replacing class-validator DTOs in shared/dto/execution.dto.ts)
export const ParseGoalSchema = z.object({
  goal: z.string().min(1).max(2000),
});

export type ParseGoalDto = z.infer<typeof ParseGoalSchema>;

export const ExecuteGoalSchema = z.object({
  goal: z.string().min(1).max(2000),
  mode: z.enum(['autonomous', 'approval_required', 'simulation']),
  maxBudget: z.number().optional(),
  preferredSites: z.array(z.string()).optional(),
  allowPayments: z.boolean().optional(),
  allowLogin: z.boolean().optional(),
  profile: z.enum(['conservative', 'balanced', 'aggressive']).optional(),
});

export type ExecuteGoalDto = z.infer<typeof ExecuteGoalSchema>;

export const StartExecutionSchema = z.object({
  taskId: z.string().min(1),
  goal: z.string().min(1).max(2000),
  config: z.object({
    headless: z.boolean().optional(),
    viewport: z.object({ width: z.number(), height: z.number() }).optional(),
    proxy: z.object({
      server: z.string().url().refine(url => {
        try {
          const h = new URL(url).hostname;
          return !['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(h) &&
            !h.startsWith('192.168.') &&
            !h.startsWith('10.') &&
            !h.startsWith('169.254.') &&
            !/^172\.(1[6-9]|2[0-9]|3[01])\./.test(h);
        } catch { return false; }
      }, 'Internal or loopback proxy addresses are not allowed'),
      username: z.string().optional(),
      password: z.string().optional(),
    }).optional(),
    maxRetries: z.number().optional(),
    timeout: z.number().optional(),
  }).optional(),
  context: z.record(z.unknown()).optional(),
});

export type StartExecutionDto = z.infer<typeof StartExecutionSchema>;

export const NaturalLanguageCommandSchema = z.object({
  command: z.string().min(1).max(2000),
});

export type NaturalLanguageCommandDto = z.infer<typeof NaturalLanguageCommandSchema>;

export const CreateScheduleSchema = z.object({
  name: z.string().min(1).max(255),
  cronExpression: z.string().min(1).max(100).refine(v => {
    try { CronExpressionParser.parse(v); return true; } catch { return false; }
  }, 'Invalid cron expression'),
  goal: z.string().min(1).max(2000),
  config: z.record(z.unknown()).optional(),
});

export type CreateScheduleDto = z.infer<typeof CreateScheduleSchema>;

export const ApprovalResponseSchema = z.object({
  approvalRequestId: z.string().min(1),
  reason: z.string().optional(),
});

export type ApprovalResponseDto = z.infer<typeof ApprovalResponseSchema>;

export const UpdateScheduleSchema = z.object({
  name: z.string().optional(),
  cronExpression: z.string().min(1).max(100).refine(v => {
    try { CronExpressionParser.parse(v); return true; } catch { return false; }
  }, 'Invalid cron expression').optional(),
  goal: z.string().optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

export type UpdateScheduleDto = z.infer<typeof UpdateScheduleSchema>;

export const SaveProfileSchema = z.object({
  name: z.string().max(255).optional(),
  preferences: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean()]).nullable()
  ).optional(),
});
// .passthrough() removed — strip unknown keys by default

export type SaveProfileDto = z.infer<typeof SaveProfileSchema>;

export const SavePreferencesSchema = z.object({
  preferredSites: z.array(z.string()).optional(),
  avoidedSites: z.array(z.string()).optional(),
  preferredJobSites: z.array(z.string()).optional(),
  preferredFoodApps: z.array(z.string()).optional(),
  preferredShoppingSites: z.array(z.string()).optional(),
  preferredTravelSites: z.array(z.string()).optional(),
  preferredEmailServices: z.array(z.string()).optional(),
  preferredMediaServices: z.array(z.string()).optional(),
});

export type SavePreferencesDto = z.infer<typeof SavePreferencesSchema>;

export const MultiAgentOrchestrateSchema = z.object({
  goal: z.string().min(1, 'Goal is required').max(5000),
  mode: z.enum(['autonomous', 'supervised']).optional().default('autonomous'),
  preferredAgents: z.array(z.string()).optional(),
  maxParallel: z.number().min(1).max(10).optional().default(5),
});

export type MultiAgentOrchestrateDto = z.infer<typeof MultiAgentOrchestrateSchema>;
