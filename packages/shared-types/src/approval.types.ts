import { z } from 'zod';

export const ApprovalStatusSchema = z.enum(['PENDING', 'APPROVED', 'REJECTED', 'EXPIRED']);
export type ApprovalStatus = z.infer<typeof ApprovalStatusSchema>;

export const ApprovalSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  userId: z.string(),
  reason: z.string(),
  context: z.any().optional(),
  status: ApprovalStatusSchema,
  expiresAt: z.date(),
  respondedAt: z.date().optional(),
  response: z.any().optional(),
  createdAt: z.date(),
});

export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalRequestDtoSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  reason: z.string(),
  context: z.any().optional(),
  expiresAt: z.date().optional(),
});

export type ApprovalRequestDto = z.infer<typeof ApprovalRequestDtoSchema>;

export const ApprovalResponseDtoSchema = z.object({
  approvalId: z.string(),
  status: z.enum(['APPROVED', 'REJECTED']),
  response: z.any().optional(),
});

export type ApprovalResponseDto = z.infer<typeof ApprovalResponseDtoSchema>;