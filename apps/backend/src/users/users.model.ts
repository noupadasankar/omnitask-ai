// apps/backend/src/users/users.model.ts
//
// Zod schema + types for the users module. Folds in the old
// dto/update-user.dto.ts so validateBody(UpdateUserSchema) enforces the exact
// same constraints the NestJS ZodValidationPipe did (name/email/password all
// optional, same min/max).

import { z } from 'zod';

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).max(128).optional(),
});

export type UpdateUserInput = z.infer<typeof UpdateUserSchema>;
