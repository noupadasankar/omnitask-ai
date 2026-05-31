import { z } from 'zod';

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
});

export type UpdateUserDto = z.infer<typeof UpdateUserSchema>;