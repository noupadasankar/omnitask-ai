import { z } from 'zod';

export const TaskStatusSchema = z.enum([
  'QUEUED', 'PLANNING', 'AWAITING_APPROVAL', 'RUNNING', 
  'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED'
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

export const TaskTriggerSchema = z.enum(['MANUAL', 'SCHEDULED', 'SKILL', 'API']);
export type TaskTrigger = z.infer<typeof TaskTriggerSchema>;

export const TaskSchema = z.object({
  id: z.string(),
  userId: z.string(),
  title: z.string(),
  naturalLanguage: z.string(),
  status: TaskStatusSchema,
  priority: TaskPrioritySchema,
  trigger: TaskTriggerSchema,
  shadowMode: z.boolean(),
  riskScore: z.number().optional(),
  errorMessage: z.string().optional(),
  result: z.any().optional(),
  context: z.any().optional(),
  agentType: z.string().optional(),
  planHash: z.string().optional(),
  parentTaskId: z.string().optional(),
  scheduleId: z.string().optional(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Task = z.infer<typeof TaskSchema>;

export const CreateTaskDtoSchema = z.object({
  title: z.string().min(1),
  naturalLanguage: z.string().min(1),
  priority: TaskPrioritySchema.optional(),
  shadowMode: z.boolean().optional(),
  context: z.any().optional(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;

export const UpdateTaskDtoSchema = z.object({
  title: z.string().optional(),
  priority: TaskPrioritySchema.optional(),
  context: z.any().optional(),
});

export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;