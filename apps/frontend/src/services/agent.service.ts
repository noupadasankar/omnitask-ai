import { api } from './api';
import type { AgentPlan } from '@/types/agent';

export interface StartExecutionPayload {
  taskId: string;
  goal: string;
  config?: {
    headless?: boolean;
    viewport?: { width: number; height: number };
    maxRetries?: number;
    timeout?: number;
  };
}

export async function startAgentExecution(
  payload: StartExecutionPayload,
): Promise<{ sessionId: string }> {
  const { data } = await api.post<{ sessionId: string }>('/agent/execute', payload);
  return data;
}

export async function getAgentSession(sessionId: string) {
  const { data } = await api.get(`/agent/session/${sessionId}`);
  return data;
}

export async function getAgentSessionSteps(sessionId: string) {
  const { data } = await api.get<{
    steps: AgentPlan['steps'];
    currentStepIndex: number;
    totalSteps: number;
  }>(`/agent/session/${sessionId}/steps`);
  return data;
}

export async function respondToApproval(
  approvalRequestId: string,
  status: 'APPROVED' | 'DENIED',
) {
  const { data } = await api.post('/agent/approve', {
    approvalRequestId,
    status,
  });
  return data;
}
