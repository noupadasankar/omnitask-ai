// apps/backend/src/core/http/roles.middleware.ts
//
// Express equivalent of RolesGuard + @Roles() decorator
// (apps/backend/src/common/guards/roles.guard.ts,
//  apps/backend/src/common/decorators/roles.decorator.ts). Same contract:
// the authenticated user's role must be in the allowed set, else 403.
// Mount AFTER authMiddleware (which populates req.user.role) on the routes
// that need it, e.g. `router.get('/', requireRole('ADMIN', 'SUPERADMIN'), ...)`.

import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth.middleware';
import { HttpError } from './error.middleware';

export function requireRole(...roles: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const role = (req as AuthedRequest).user?.role;
    if (!role || !roles.includes(role)) {
      next(new HttpError(403, 'Insufficient permissions'));
      return;
    }
    next();
  };
}
