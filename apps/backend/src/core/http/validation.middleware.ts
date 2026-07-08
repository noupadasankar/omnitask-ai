// apps/backend/src/core/http/validation.middleware.ts
//
// Express equivalent of ZodValidationPipe
// (apps/backend/src/common/pipes/zod-validation.pipe.ts). Same contract:
// 400 with { message: 'Validation failed', errors: fieldErrors } on mismatch,
// replaces req.body with the parsed (and thus typed + defaulted) value on
// success — mirrors NestJS's `transform: true` behavior for migrated routes.

import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';
import { HttpError } from './error.middleware';

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new HttpError(400, 'Validation failed', {
          message: 'Validation failed',
          errors: result.error.flatten().fieldErrors,
        }),
      );
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(
        new HttpError(400, 'Validation failed', {
          message: 'Validation failed',
          errors: result.error.flatten().fieldErrors,
        }),
      );
      return;
    }
    (req as any).validatedQuery = result.data;
    next();
  };
}
