import { z } from 'zod';

export const CreateFileDtoSchema = z.object({
  name: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  taskId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateFileDto = z.infer<typeof CreateFileDtoSchema>;

export const UpdateFileDtoSchema = z.object({
  name: z.string().optional(),
  mimeType: z.string().optional(),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateFileDto = z.infer<typeof UpdateFileDtoSchema>;
