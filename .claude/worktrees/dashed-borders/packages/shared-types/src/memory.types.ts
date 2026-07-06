import { z } from 'zod';

export const MemoryTypeSchema = z.enum(['EPISODIC', 'SEMANTIC', 'PROCEDURAL', 'WORKING']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const MemorySchema = z.object({
  id: z.string(),
  userId: z.string(),
  taskId: z.string().optional(),
  type: MemoryTypeSchema,
  content: z.string(),
  summary: z.string().optional(),
  metadata: z.any().optional(),
  importance: z.number().min(0).max(1),
  accessCount: z.number(),
  lastUsedAt: z.date().optional(),
  expiresAt: z.date().optional(),
  createdAt: z.date(),
});

export type Memory = z.infer<typeof MemorySchema>;

export const MemoryQueryDtoSchema = z.object({
  query: z.string(),
  type: MemoryTypeSchema.optional(),
  limit: z.number().optional(),
  threshold: z.number().optional(),
});

export type MemoryQueryDto = z.infer<typeof MemoryQueryDtoSchema>;