import { z } from 'zod';

export const ConnectCalendarSchema = z.object({
  provider: z.enum(['google', 'outlook']),
  code: z.string().min(1),
  redirectUri: z.string().url(),
});

export type ConnectCalendarDto = z.infer<typeof ConnectCalendarSchema>;

export const CreateEventSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().optional(),
  location: z.string().optional(),
  startTime: z.string().datetime(),
  endTime: z.string().datetime(),
  isAllDay: z.boolean().optional(),
  timezone: z.string().optional(),
  attendees: z.array(z.object({ email: z.string().email(), name: z.string().optional() })).optional(),
  travelBufferMin: z.number().int().min(0).max(480).optional(),
  reminders: z.array(z.object({ method: z.enum(['email', 'popup']), minutes: z.number().int() })).optional(),
});

export type CreateEventDto = z.infer<typeof CreateEventSchema>;

export const UpdateEventSchema = CreateEventSchema.partial();
export type UpdateEventDto = z.infer<typeof UpdateEventSchema>;

export const FindTimeSchema = z.object({
  durationMin: z.number().int().min(15).max(480),
  startBuffer: z.string().datetime(),
  endBuffer: z.string().datetime(),
  timezone: z.string().optional(),
  preferredDays: z.array(z.number().int().min(0).max(6)).optional(),
  preferredStartHour: z.number().int().min(0).max(23).optional(),
  preferredEndHour: z.number().int().min(0).max(23).optional(),
  minTravelBuffer: z.number().int().min(0).optional(),
});

export type FindTimeDto = z.infer<typeof FindTimeSchema>;
