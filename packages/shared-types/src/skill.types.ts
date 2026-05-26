import { z } from 'zod';

export const SkillSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  planTemplate: z.any(),
  triggerCount: z.number(),
  successRate: z.number(),
  version: z.number(),
  isPublic: z.boolean(),
  tags: z.array(z.string()),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type Skill = z.infer<typeof SkillSchema>;

export const CreateSkillDtoSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  planTemplate: z.any(),
  isPublic: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateSkillDto = z.infer<typeof CreateSkillDtoSchema>;

export const InvokeSkillDtoSchema = z.object({
  skillId: z.string(),
  params: z.any().optional(),
});

export type InvokeSkillDto = z.infer<typeof InvokeSkillDtoSchema>;