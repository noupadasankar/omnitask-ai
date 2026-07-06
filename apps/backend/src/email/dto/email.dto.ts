import { z } from 'zod';

export const EmailConfigSchema = z.object({
  provider: z.enum(['gmail', 'outlook', 'imap']),
  email: z.string().email('Invalid email address'),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().int().positive().optional(),
  imapHost: z.string().optional(),
  imapPort: z.number().int().positive().optional(),
  useTls: z.boolean().optional(),
});

export type EmailConfigDto = z.infer<typeof EmailConfigSchema>;

export const SendEmailInputSchema = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient required'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  attachments: z.array(z.object({
    filename: z.string().min(1),
    content: z.string().min(1),
    encoding: z.string().optional(),
  })).optional(),
});

export type SendEmailInputDto = z.infer<typeof SendEmailInputSchema>;

export const DraftEmailSchema = z.object({
  to: z.array(z.string().email()).min(1, 'At least one recipient required'),
  subject: z.string().min(1, 'Subject is required').max(500),
  body: z.string().min(1, 'Body is required'),
});

export type DraftEmailDto = z.infer<typeof DraftEmailSchema>;
