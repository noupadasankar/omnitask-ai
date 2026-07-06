import { z } from 'zod';

export const ExecutionStatusSchema = z.enum(['RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED']);
export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const StepStatusSchema = z.enum(['PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'COMPENSATED']);
export type StepStatus = z.infer<typeof StepStatusSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  stepIndex: z.number(),
  stepType: z.string(),
  action: z.string(),
  status: StepStatusSchema,
  input: z.any().optional(),
  output: z.any().optional(),
  errorMessage: z.string().optional(),
  screenshotKey: z.string().optional(),
  domSnapshot: z.string().optional(),
  durationMs: z.number().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;

export const ExecutionSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  attemptNumber: z.number(),
  status: ExecutionStatusSchema,
  graph: z.any().optional(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
  durationMs: z.number().optional(),
  steps: z.array(ExecutionStepSchema),
});

export type Execution = z.infer<typeof ExecutionSchema>;

export const ExecutionEventSchema = z.object({
  taskId: z.string(),
  executionId: z.string(),
  step: ExecutionStepSchema.optional(),
  status: ExecutionStatusSchema,
  error: z.string().optional(),
});

export type ExecutionEvent = z.infer<typeof ExecutionEventSchema>;