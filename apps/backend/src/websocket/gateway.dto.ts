import { z } from 'zod';

export const SessionJoinSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().optional(),
});

export const SessionLeaveSchema = z.object({
  sessionId: z.string().min(1),
});

export const ApprovalRespondSchema = z.object({
  approvalRequestId: z.string().min(1),
  sessionId: z.string().optional(),
  stepIndex: z.number().optional(),
  status: z.enum(['APPROVED', 'DENIED']),
});

export const BrowserInputSchema = z.object({
  sessionId: z.string().min(1),
}).passthrough();

export const ClarificationResponseSchema = z.object({
  sessionId: z.string().min(1),
  answers: z.string().min(1),
});

export const SessionActionSchema = z.object({
  sessionId: z.string().min(1),
});

export const PingSchema = z.any();
