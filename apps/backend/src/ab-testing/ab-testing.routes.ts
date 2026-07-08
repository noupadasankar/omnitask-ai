// apps/backend/src/ab-testing/ab-testing.routes.ts
//
// Express router replacing AbTestingController. Same 4 endpoints, same auth
// requirement (JwtAuthGuard → authMiddleware), same param/body shapes. The two
// POST bodies — previously `@Body() dto: any` with zero validation — are now
// validated by validateBody(...). Mounted at /api/ab-testing in main.ts.

import { Router } from 'express';
import { container, TYPES } from '../core/container';
import { authMiddleware, type AuthedRequest } from '../core/http/auth.middleware';
import { validateBody } from '../core/http/validation.middleware';
import { asyncHandler } from '../core/http/base-router';
import { createTestSchema, recordRunSchema } from './ab-testing.model';
import type { AbTestingService } from './ab-testing.service';

export function buildAbTestingRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.post(
    '/',
    validateBody(createTestSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<AbTestingService>(TYPES.AbTestingService);
      const result = await service.createTest((req as AuthedRequest).user.id, req.body);
      res.json(result);
    }),
  );

  router.post(
    '/:id/record',
    validateBody(recordRunSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<AbTestingService>(TYPES.AbTestingService);
      const result = await service.recordRun(req.params.id as string, req.body);
      res.json(result);
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const service = container.get<AbTestingService>(TYPES.AbTestingService);
      const result = await service.listActive((req as AuthedRequest).user.id);
      res.json(result);
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const service = container.get<AbTestingService>(TYPES.AbTestingService);
      const result = await service.getResults(req.params.id as string);
      res.json(result);
    }),
  );

  return router;
}
