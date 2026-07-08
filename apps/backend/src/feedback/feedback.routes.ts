// apps/backend/src/feedback/feedback.routes.ts
//
// Express router replacing FeedbackController. Same 3 endpoints, same auth
// requirement (JwtAuthGuard → authMiddleware), same query/body shapes.
// Mounted at /api/feedback in main.ts.

import { Router } from 'express';
import { container, TYPES } from '../core/container';
import { authMiddleware, type AuthedRequest } from '../core/http/auth.middleware';
import { validateBody } from '../core/http/validation.middleware';
import { asyncHandler } from '../core/http/base-router';
import { createFeedbackSchema } from './feedback.model';
import type { FeedbackService } from './feedback.service';

export function buildFeedbackRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.post(
    '/',
    validateBody(createFeedbackSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<FeedbackService>(TYPES.FeedbackService);
      const result = await service.submit((req as AuthedRequest).user.id, req.body);
      res.json(result);
    }),
  );

  router.get(
    '/',
    asyncHandler(async (req, res) => {
      const service = container.get<FeedbackService>(TYPES.FeedbackService);
      const limitParam = req.query.limit as string | undefined;
      const result = await service.list(
        (req as AuthedRequest).user.id,
        limitParam ? parseInt(limitParam, 10) : 20,
      );
      res.json(result);
    }),
  );

  router.get(
    '/stats',
    asyncHandler(async (req, res) => {
      const service = container.get<FeedbackService>(TYPES.FeedbackService);
      const result = await service.getStats((req as AuthedRequest).user.id);
      res.json(result);
    }),
  );

  return router;
}
