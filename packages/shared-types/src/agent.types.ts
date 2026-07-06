import { z } from 'zod';

export const AgentTypeSchema = z.enum(['browser', 'api', 'file', 'research', 'data', 'notification', 'supervisor']);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const AgentResultSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  metadata: z.any().optional(),
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

export interface AgentInterface {
  execute(params: any): Promise<AgentResult>;
  canHandle(task: string): Promise<boolean>;
}