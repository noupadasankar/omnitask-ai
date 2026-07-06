import { z } from 'zod';

export const CursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

export type CursorPaginationDto = z.infer<typeof CursorPaginationSchema>;

export interface CursorPage<T> {
  data: T[];
  nextCursor: string | null;
  hasMore: boolean;
}
