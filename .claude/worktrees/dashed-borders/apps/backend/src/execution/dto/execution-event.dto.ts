import { z } from 'zod';

export const ExecutionEventDtoSchema = z.object({
  taskId: z.string(),
  executionId: z.string(),
  stepIndex: z.number().optional(),
  status: z.enum(['STARTED', 'STEP_START', 'STEP_COMPLETE', 'COMPLETED', 'FAILED']),
  data: z.any().optional(),
  error: z.string().optional(),
});

export type ExecutionEventDto = z.infer<typeof ExecutionEventDtoSchema>;

export const CheckpointDtoSchema = z.object({
  executionId: z.string(),
  stepIndex: z.number(),
  completedSteps: z.array(z.any()),
  context: z.any().optional(),
});

export type CheckpointDto = z.infer<typeof CheckpointDtoSchema>;