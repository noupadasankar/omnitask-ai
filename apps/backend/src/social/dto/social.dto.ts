import { z } from 'zod';

export const GeneratePostSchema = z.object({
  topic: z.string().min(1, 'Topic is required').max(500),
  platform: z.string().min(1, 'Platform is required').max(50),
  tone: z.string().max(50).optional(),
});

export type GeneratePostDto = z.infer<typeof GeneratePostSchema>;

export const SchedulePostSchema = z.object({
  postId: z.string().min(1, 'Post ID is required'),
  scheduledAt: z.string().min(1, 'Scheduled time is required').refine(
    (val) => !isNaN(Date.parse(val)),
    'Invalid date format',
  ),
});

export type SchedulePostDto = z.infer<typeof SchedulePostSchema>;
