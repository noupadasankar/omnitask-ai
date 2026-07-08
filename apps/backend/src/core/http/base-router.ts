// apps/backend/src/core/http/base-router.ts
//
// Thin helper for building Express routers from migrated modules. Express 5
// (in use here, per @types/express ^5.0.6) already forwards rejected promises
// from async handlers to next(err) automatically, but wrapping keeps intent
// explicit and protects against a future Express 4 downgrade.

import type { Request, Response, NextFunction, RequestHandler } from 'express';

export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
