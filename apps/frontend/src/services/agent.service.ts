import { api } from './api';
import type { AgentPlan, ExecutionSession } from '@/types/agent';

export interface StartGoalPayload {
  goal: string;
  mode: 'autonomous' | 'approval_required' | 'simulation';
  maxBudget?: number;
  preferredSites?: string[];
  allowPayments?: boolean;
  allowLogin?: boolean;
}

export async function parseGoal(goal: string): Promise<any> {
  const { data } = await api.post('/agent/parse-goal', { goal });
  return data;
}

export async function startGoalExecution(
  payload: StartGoalPayload,
): Promise<{ sessionId: string; parsedGoal: any }> {
  const { data } = await api.post<{ sessionId: string; parsedGoal: any }>('/agent/start', payload);
  return data;
}

export async function startAgentExecution(
  payload: { taskId: string; goal: string; config?: any },
): Promise<{ sessionId: string }> {
  const { data } = await api.post<{ sessionId: string }>('/agent/execute', payload);
  return data;
}

export async function getAgentSession(sessionId: string): Promise<ExecutionSession> {
  const { data } = await api.get<ExecutionSession>(`/agent/session/${sessionId}`);
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

export async function sendCommand(sessionId: string, command: string): Promise<{ success: boolean; feedback: string }> {
  const { data } = await api.post<{ success: boolean; feedback: string }>(`/agent/session/${sessionId}/interrupt`, { command });
  return data;
}

export async function pauseSession(sessionId: string): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(`/agent/session/${sessionId}/pause`);
  return data;
}

export async function resumeSession(sessionId: string): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(`/agent/session/${sessionId}/resume`);
  return data;
}

export async function cancelSession(sessionId: string): Promise<{ success: boolean }> {
  const { data } = await api.post<{ success: boolean }>(`/agent/session/${sessionId}/cancel`);
  return data;
}

export async function respondToApproval(
  approvalRequestId: string,
  status: 'APPROVED' | 'DENIED',
) {
  const endpoint = status === 'APPROVED' ? '/agent/approve' : '/agent/reject';
  const { data } = await api.post(endpoint, {
    approvalRequestId,
    status,
  });
  return data;
}

export async function getSessionReplay(sessionId: string): Promise<{ replay: any[] }> {
  const { data } = await api.get<{ replay: any[] }>(`/agent/replay/${sessionId}`);
  return data;
}

export async function getSessionTimeline(sessionId: string): Promise<any> {
  const { data } = await api.get<any>(`/agent/session/${sessionId}/timeline`);
  return data;
}

export async function getUserHistory(): Promise<any[]> {
  const { data } = await api.get<any[]>('/agent/history');
  return data;
}

export async function getUserMemories(): Promise<any[]> {
  const { data } = await api.get<any[]>('/agent/memory');
  return data;
}

// Schedules API
export async function getSchedules(): Promise<any[]> {
  const { data } = await api.get<any[]>('/agent/schedules');
  return data;
}

export async function createSchedule(payload: { name: string; cronExpression: string; goal: string; config?: any }): Promise<any> {
  const { data } = await api.post<any>('/agent/schedules', payload);
  return data;
}

export async function updateSchedule(id: string, payload: any): Promise<any> {
  const { data } = await api.put<any>(`/agent/schedules/${id}`, payload);
  return data;
}

export async function deleteSchedule(id: string): Promise<any> {
  const { data } = await api.delete<any>(`/agent/schedules/${id}`);
  return data;
}

export async function getUserProfileCard(): Promise<any> {
  const { data } = await api.get<any>('/agent/profile');
  return data;
}

export async function saveUserProfileCard(card: any): Promise<any> {
  const { data } = await api.post<any>('/agent/profile', card);
  return data;
}

export async function listSkills(): Promise<any[]> {
  const { data } = await api.get<any[]>('/agent/skills');
  return data;
}
