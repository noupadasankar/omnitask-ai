import { z } from 'zod';

export const PlayMediaSchema = z.object({
  query: z.string().max(500).optional(),
  trackId: z.string().max(200).optional(),
  provider: z.string().max(50).optional(),
}).refine(
  (data) => data.query || data.trackId,
  { message: 'Provide query or trackId' },
);

export type PlayMediaDto = z.infer<typeof PlayMediaSchema>;

export const QueueMediaSchema = z.object({
  trackId: z.string().min(1, 'Track ID is required').max(200),
  provider: z.string().max(50).optional(),
});

export type QueueMediaDto = z.infer<typeof QueueMediaSchema>;

export const PauseMediaSchema = z.object({
  provider: z.string().max(50).optional(),
});

export type PauseMediaDto = z.infer<typeof PauseMediaSchema>;
