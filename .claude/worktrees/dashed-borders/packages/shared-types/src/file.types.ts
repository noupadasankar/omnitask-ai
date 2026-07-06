import { z } from 'zod';

export const FileSchema = z.object({
  id: z.string(),
  userId: z.string(),
  taskId: z.string().optional(),
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.bigint(),
  storageKey: z.string(),
  bucketName: z.string(),
  checksum: z.string(),
  metadata: z.any().optional(),
  tags: z.array(z.string()),
  createdAt: z.date(),
});

export type File = z.infer<typeof FileSchema>;

export const UploadFileDtoSchema = z.object({
  name: z.string(),
  mimeType: z.string(),
  sizeBytes: z.bigint(),
  checksum: z.string(),
  tags: z.array(z.string()).optional(),
});

export type UploadFileDto = z.infer<typeof UploadFileDtoSchema>;