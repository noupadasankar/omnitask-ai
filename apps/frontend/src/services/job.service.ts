import { api } from './api';

export interface JobPreference {
  id?: string;
  userId?: string;
  roles: string[];
  locations: string[];
  requiredKeywords: string[];
  preferredKeywords: string[];
  excludeKeywords: string[];
  skills: string[];
  minScore: number;
  dailyLimit: number;
  remoteOnly: boolean;
  minSalary?: number | null;
}

export interface JobApplication {
  id: string;
  portal: string;
  externalJobId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string | null;
  score: number;
  matchReasons: any;
  status: 'MATCHED' | 'SKIPPED' | 'PENDING_APPROVAL' | 'APPLIED' | 'FAILED';
  appliedAt?: string | null;
  createdAt: string;
}

export async function getJobPreferences(): Promise<JobPreference> {
  const { data } = await api.get<JobPreference>('/job/preferences');
  return data;
}

export async function saveJobPreferences(prefs: JobPreference): Promise<JobPreference> {
  const { data } = await api.put<JobPreference>('/job/preferences', prefs);
  return data;
}

export async function getJobApplications(status?: string): Promise<JobApplication[]> {
  const { data } = await api.get<JobApplication[]>('/job/applications', {
    params: status ? { status } : undefined,
  });
  return data;
}

export async function getJobStats(): Promise<any> {
  const { data } = await api.get<any>('/job/stats');
  return data;
}

export interface LaunchJobAgentInput {
  portals?: string[];
  roles?: string[];
  locations?: string[];
  minScore?: number;
  maxApplications?: number;
  dryRun?: boolean;
  userProfile?: { name: string; email: string; phone: string };
  credentials?: Record<string, { email: string; password: string }>;
}

export interface LaunchJobAgentResult {
  sessionId: string;
  taskId: string;
  /** False when the Python engine is offline (run queued but not started). */
  dispatched: boolean;
}

export async function launchJobAgent(
  input: LaunchJobAgentInput,
): Promise<LaunchJobAgentResult> {
  const { data } = await api.post<LaunchJobAgentResult>('/job/launch', input);
  return data;
}

export async function stopJobAgent(sessionId: string): Promise<{ stopped: boolean }> {
  const { data } = await api.post<{ stopped: boolean }>('/job/stop', { sessionId });
  return data;
}

export async function uploadResume(file: File): Promise<{ filename: string; saved: boolean }> {
  const form = new FormData();
  form.append('resume', file);
  const { data } = await api.post<{ filename: string; saved: boolean }>('/job/resume', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
