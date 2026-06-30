import { z } from 'zod';

export const RoleSchema = z.enum(['USER', 'ADMIN', 'SUPERADMIN']);
export type Role = z.infer<typeof RoleSchema>;

export const PlanSchema = z.enum(['FREE', 'PRO', 'TEAM', 'ENTERPRISE']);
export type Plan = z.infer<typeof PlanSchema>;

export const UserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  name: z.string().optional(),
  avatarUrl: z.string().optional(),
  role: RoleSchema,
  mfaEnabled: z.boolean(),
  emailVerified: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type User = z.infer<typeof UserSchema>;

export const UserPreferencesSchema = z.object({
  id: z.string(),
  userId: z.string(),
  theme: z.string(),
  defaultShadowMode: z.boolean(),
  notifyOnComplete: z.boolean(),
  notifyOnApproval: z.boolean(),
  timezone: z.string(),
  language: z.string(),
});

export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const UserQuotaSchema = z.object({
  id: z.string(),
  userId: z.string(),
  plan: PlanSchema,
  tasksPerDay: z.number(),
  tasksUsedToday: z.number(),
  storageBytes: z.bigint(),
  storageUsedBytes: z.bigint(),
  concurrentTasks: z.number(),
  resetAt: z.date(),
});

export type UserQuota = z.infer<typeof UserQuotaSchema>;

export const LoginDtoSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export type LoginDto = z.infer<typeof LoginDtoSchema>;

export const RegisterDtoSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

export type RegisterDto = z.infer<typeof RegisterDtoSchema>;