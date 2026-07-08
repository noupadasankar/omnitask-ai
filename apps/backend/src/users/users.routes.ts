// apps/backend/src/users/users.routes.ts
//
// Express router replacing UsersController. Same 3 endpoints, same auth
// (JwtAuthGuard → authMiddleware), same admin gate on GET / (RolesGuard +
// @Roles → requireRole), same self-only ForbiddenException → HttpError(403)
// on PUT/DELETE. Mounted at /api/users in main.ts.

import { Router } from 'express';
import { container, TYPES } from '../core/container';
import { authMiddleware, type AuthedRequest } from '../core/http/auth.middleware';
import { requireRole } from '../core/http/roles.middleware';
import { validateBody } from '../core/http/validation.middleware';
import { asyncHandler } from '../core/http/base-router';
import { HttpError } from '../core/http/error.middleware';
import { UpdateUserSchema } from './users.model';
import type { UsersService } from './users.service';

export function buildUsersRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.get(
    '/',
    requireRole('ADMIN', 'SUPERADMIN'),
    asyncHandler(async (_req, res) => {
      const service = container.get<UsersService>(TYPES.UsersService);
      const result = await service.findAll();
      res.json(result);
    }),
  );

  router.put(
    '/:id',
    validateBody(UpdateUserSchema),
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      if ((req as AuthedRequest).user.id !== id) {
        throw new HttpError(403, 'You can only update your own profile');
      }
      const service = container.get<UsersService>(TYPES.UsersService);
      const result = await service.update(id, req.body);
      res.json(result);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const id = req.params.id as string;
      if ((req as AuthedRequest).user.id !== id) {
        throw new HttpError(403, 'You can only delete your own account');
      }
      const service = container.get<UsersService>(TYPES.UsersService);
      const result = await service.remove(id);
      res.json(result);
    }),
  );

  return router;
}
