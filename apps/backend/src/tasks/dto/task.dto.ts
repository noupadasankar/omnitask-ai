import { z } from 'zod';

export const CreateTaskDtoSchema = z.object({
  title: z.string().min(1).optional(),
  naturalLanguage: z.string().min(3),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  shadowMode: z.boolean().optional(),
  context: z.any().optional(),
});

export type CreateTaskDto = z.infer<typeof CreateTaskDtoSchema>;

export const UpdateTaskDtoSchema = z.object({
  title: z.string().optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  context: z.any().optional(),
});

export type UpdateTaskDto = z.infer<typeof UpdateTaskDtoSchema>;

export const TaskFilterDtoSchema = z.object({
  status: z.enum(['QUEUED', 'PLANNING', 'PLANNED', 'AWAITING_APPROVAL', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  limit: z.number().optional(),
  offset: z.number().optional(),
});

export type TaskFilterDto = z.infer<typeof TaskFilterDtoSchema>;