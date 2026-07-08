// apps/backend/src/feedback/feedback.model.ts
//
// Zod schema + types for the feedback module. Replaces the old untyped
// `dto: any` on FeedbackController.submit() — the NestJS ValidationPipe
// never actually validated that endpoint since it lacked a class-validator
// DTO class; validateBody(createFeedbackSchema) now enforces this for real.

import { z } from 'zod';

export const createFeedbackSchema = z.object({
  taskId: z.string().optional(),
  sessionId: z.string().optional(),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  comment: z.string().optional(),
  category: z.string().optional(),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>;

export const RATING_MAP = { 1: 'ONE', 2: 'TWO', 3: 'THREE', 4: 'FOUR', 5: 'FIVE' } as const;
export const RATING_VALUES: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
};

export interface FeedbackRow {
  rating: string;
  category: string | null;
}

export interface FeedbackStats {
  total: number;
  averageRating: number;
  distribution: Record<string, number>;
  categoryBreakdown: Record<string, number>;
}
