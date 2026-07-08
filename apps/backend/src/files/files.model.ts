// apps/backend/src/files/files.model.ts
//
// Zod schemas + types for the files module. Folds in the old dto/file.dto.ts
// so validateBody(...) enforces the exact same shapes the NestJS
// ZodValidationPipe did. NO decorators.

import { z } from 'zod';

export const CreateFileDtoSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  taskId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateFileInput = z.infer<typeof CreateFileDtoSchema>;

export const UpdateFileDtoSchema = z.object({
  name: z.string().optional(),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateFileInput = z.infer<typeof UpdateFileDtoSchema>;

// The subset of a Multer memory-storage file the service consumes. Replaces
// the local interface the old files.service.ts declared for @UploadedFile().
export interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  size: number;
  mimetype: string;
}
