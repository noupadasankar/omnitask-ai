import { CursorPage } from '../dto/pagination.dto';

export function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf-8').toString('base64url');
}

export function decodeCursor(cursor: string): string | undefined {
  if (!cursor) return undefined;
  try {
    const buf = Buffer.from(cursor, 'base64url');
    if (buf.length === 0) return undefined;
    return buf.toString('utf-8');
  } catch {
    return undefined;
  }
}

export function buildCursorResponse<T extends { id: string }>(
  items: T[],
  take: number,
): CursorPage<T> {
  const hasMore = items.length > take;
  const data = hasMore ? items.slice(0, take) : items;
  const last = data[data.length - 1];
  return {
    data,
    nextCursor: last && hasMore ? encodeCursor(last.id) : null,
    hasMore,
  };
}

export interface PrismaFindManyArgs {
  take?: number;
  skip?: number;
  cursor?: { id: string };
  where?: Record<string, any>;
  orderBy?: Record<string, string>;
  include?: Record<string, any>;
  select?: Record<string, any>;
}

export function createCursorArgs(
  cursor?: string,
  take: number = 20,
): Pick<PrismaFindManyArgs, 'take' | 'skip' | 'cursor'> {
  const decoded = cursor ? decodeCursor(cursor) : undefined;
  return {
    take: take + 1,
    skip: decoded ? 1 : 0,
    cursor: decoded ? { id: decoded } : undefined,
  };
}
