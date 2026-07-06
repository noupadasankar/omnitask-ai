import { z } from 'zod';

export const StoreCredentialSchema = z.object({
  service: z.string().min(1, 'Service name is required').max(100),
  label: z.string().min(1, 'Label is required').max(200),
  credentials: z.record(z.string(), z.string()),
  hints: z.string().optional(),
});

export type StoreCredentialDto = z.infer<typeof StoreCredentialSchema>;
