import { z } from 'zod';

// 🔐 Password rules (centralized)
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

// 📩 Login
export const LoginDtoSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

// 🆕 Register
export const RegisterDtoSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: passwordSchema,
  name: z.string().min(2).max(50).optional(),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;

// 🔄 Refresh token
export const RefreshTokenDtoSchema = z.object({
  refresh_token: z.string().min(1, 'Refresh token required'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenDtoSchema>;