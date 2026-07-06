import { z } from 'zod';

export const CreateWebhookSchema = z.object({
  url: z.string().url(),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1, 'At least one event is required'),
  retryCount: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
});

export type CreateWebhookDto = z.infer<typeof CreateWebhookSchema>;

export const UpdateWebhookSchema = z.object({
  url: z.string().url().optional(),
  secret: z.string().optional(),
  events: z.array(z.string()).min(1).optional(),
  enabled: z.boolean().optional(),
  retryCount: z.number().int().min(0).max(10).optional(),
  timeoutMs: z.number().int().min(1000).max(60000).optional(),
});

export type UpdateWebhookDto = z.infer<typeof UpdateWebhookSchema>;
