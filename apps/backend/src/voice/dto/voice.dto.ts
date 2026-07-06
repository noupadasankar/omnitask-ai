import { z } from 'zod';

export const SttSchema = z.object({
  language: z.string().max(20).optional(),
  sessionId: z.string().max(100).optional(),
});

export type SttDto = z.infer<typeof SttSchema>;

export const TtsSchema = z.object({
  text: z.string().min(1, 'Text is required').max(5000),
  voice: z.string().max(50).optional(),
  speed: z.number().min(0.25).max(4.0).optional(),
  sessionId: z.string().max(100).optional(),
});

export type TtsDto = z.infer<typeof TtsSchema>;

export const VoiceCommandSchema = z.object({
  language: z.string().max(20).optional(),
  sessionId: z.string().max(100).optional(),
  wakeWordDetected: z.string().optional(),
});

export type VoiceCommandDto = z.infer<typeof VoiceCommandSchema>;
