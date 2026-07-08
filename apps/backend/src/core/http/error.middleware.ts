// apps/backend/src/core/http/error.middleware.ts
//
// Express equivalent of the NestJS-era AllExceptionsFilter
// (apps/backend/src/common/filters/all-exceptions.filter.ts). Same
// contract: never leak stack traces, same JSON response shape, same
// CSRF-error → 403 special case. Mount last, after all migrated routers.

import type { Request, Response, NextFunction } from 'express';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export function errorMiddleware(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  const isCsrfError =
    err instanceof Error &&
    (err.message?.toLowerCase().includes('csrf') || (err as any).code === 'EBADCSRFTOKEN');

  const status = err instanceof HttpError ? err.status : isCsrfError ? 403 : 500;

  let errorMessage: string | string[];
  if (err instanceof HttpError) {
    errorMessage = (err.details as any)?.message ?? err.message;
  } else if (err instanceof Error && status !== 500) {
    errorMessage = err.message;
  } else {
    errorMessage = 'Internal server error';
  }

  res.status(status).json({
    statusCode: status,
    error: errorMessage,
    timestamp: new Date().toISOString(),
    path: req.url,
    message: errorMessage,
  });
}
