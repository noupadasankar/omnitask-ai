import { api } from './api';
import type { AgentPlan, ExecutionSession } from '@/types/agent';

export interface StartGoalPayload {
  goal: string;
  mode: 'autonomous' | 'approval_required' | 'simulation';
  maxBudget?: number;
  preferredSites?: string[];
  allowPayments?: boolean;
  allowLogin?: boolean;
  // ─── COS Execution Profile ──────────────────────────────────
  profile?: 'conservative' | 'balanced' | 'aggressive';
}

export async function parseGoal(goal: string): Promise<any> {
  const { data } = await api.post('/agent/parse-goal', { goal });
  return data;
}

export async function refineGoal(currentGoal: any, userFeedback: string): Promise<any> {
  const { data } = await api.post('/agent/refine-goal', { currentGoal, userFeedback });
  return data;
}
export async function clarifyGoal(goal: string) {
  const res = await api.post('/agent/clarify', { goal });
  return res.data; // { ambiguityScore, clarifyingQuestions, ... }
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

export interface ReplayThought {
  stepIndex: number;
  timestamp: number;
  tool?: string;
  thought?: string;
  confidence?: number;
  risk?: number;
  url?: string;
  decision?: unknown;
  observation?: string;
}

export async function getSessionThoughts(
  sessionId: string,
): Promise<{ thoughts: ReplayThought[] }> {
  const { data } = await api.get<{ thoughts: ReplayThought[] }>(
    `/agent/session/${sessionId}/thoughts`,
  );
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

export async function getAgentRegistry(): Promise<{
  agents: Array<{
    id: string;
    name: string;
    category: string;
    description: string;
    taskTypes: string[];
    pluginCount: number;
    plugins: string[];
  }>;
  plugins: Array<{
    id: string;
    name: string;
    category: string;
    supportedDomains: string[];
    version: string;
  }>;
}> {
  const { data } = await api.get('/agent/registry');
  return data;
}

export interface UserDomainPreferences {
  preferredJobSites: string[];
  preferredFoodApps: string[];
  preferredShoppingSites: string[];
  preferredTravelSites: string[];
}

export async function getDomainPreferences(): Promise<UserDomainPreferences> {
  const { data } = await api.get<UserDomainPreferences>('/agent/preferences');
  return data;
}

export async function saveDomainPreferences(prefs: UserDomainPreferences): Promise<void> {
  await api.put('/agent/preferences', prefs);
}

// ─── COS Telemetry API ─────────────────────────────────────────────────

/**
 * Fetches the live World State Object for a running session.
 * Useful for hydrating the WorldStateHud after a page reconnect.
 */
export async function getSessionWso(sessionId: string): Promise<{
  sessionId: string;
  wso: {
    stateConfidence: number;
    beliefSourceConsensus: number;
    version: number;
    belief: Record<string, { value: any; confidence: number; source: string }>;
  } | null;
}> {
  const { data } = await api.get(`/agent/session/${sessionId}/wso`);
  return data;
}

/**
 * Returns aggregated COS diagnostic summary for a session:
 * profile, status, confidence scores, step index.
 */
export async function getSessionDiagnostics(sessionId: string): Promise<{
  sessionId: string;
  profile: 'conservative' | 'balanced' | 'aggressive';
  goal: string;
  status: string;
  currentStepIndex: number;
  totalSteps: number;
  wsoConfidence: number | null;
  beliefConsensus: number | null;
  wsoVersion: number | null;
}> {
  const { data } = await api.get(`/agent/session/${sessionId}/diagnostics`);
  return data;
}
