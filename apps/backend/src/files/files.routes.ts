// apps/backend/src/files/files.routes.ts
//
// Express router replacing FilesController. Same 6 endpoints, same auth
// (JwtAuthGuard → authMiddleware), same multipart upload (FileInterceptor →
// multer memory storage), same cursor pagination, same status codes
// (201 on upload/create, 204 on delete). Mounted at /api/files in main.ts.

import { Router } from 'express';
import { container, TYPES } from '../core/container';
import { authMiddleware, type AuthedRequest } from '../core/http/auth.middleware';
import { validateBody, validateQuery } from '../core/http/validation.middleware';
import { asyncHandler } from '../core/http/base-router';
import { CursorPaginationSchema } from '../common/dto/pagination.dto';
import type { CursorPaginationDto } from '../common/dto/pagination.dto';
import { CreateFileDtoSchema, UpdateFileDtoSchema, type UploadedFile } from './files.model';
import type { FilesService } from './files.service';

// @types/multer isn't installed; require() yields an untyped (any) handle, which
// is acceptable here — the service re-types the upload via UploadedFile. Memory
// storage keeps the bytes in req.file.buffer, matching the old FileInterceptor.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

export function buildFilesRouter(): Router {
  const router = Router();
  router.use(authMiddleware);

  router.post(
    '/upload',
    upload.single('file'),
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      const file = (req as unknown as { file?: UploadedFile }).file;
      const taskId = (req.body?.taskId as string | undefined) || undefined;
      const result = await service.uploadAndCreate(
        (req as AuthedRequest).user.id,
        file as UploadedFile,
        taskId,
      );
      res.status(201).json(result);
    }),
  );

  router.get(
    '/',
    validateQuery(CursorPaginationSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      const query = (req as unknown as { validatedQuery: CursorPaginationDto }).validatedQuery;
      const result = await service.findAll((req as AuthedRequest).user.id, query.cursor, query.take);
      res.json(result);
    }),
  );

  router.get(
    '/:id',
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      const result = await service.findOne((req as AuthedRequest).user.id, req.params.id as string);
      res.json(result);
    }),
  );

  router.post(
    '/',
    validateBody(CreateFileDtoSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      const result = await service.create((req as AuthedRequest).user.id, req.body);
      res.status(201).json(result);
    }),
  );

  router.put(
    '/:id',
    validateBody(UpdateFileDtoSchema),
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      const result = await service.update(
        (req as AuthedRequest).user.id,
        req.params.id as string,
        req.body,
      );
      res.json(result);
    }),
  );

  router.delete(
    '/:id',
    asyncHandler(async (req, res) => {
      const service = container.get<FilesService>(TYPES.FilesService);
      await service.remove((req as AuthedRequest).user.id, req.params.id as string);
      res.status(204).send();
    }),
  );

  return router;
}
