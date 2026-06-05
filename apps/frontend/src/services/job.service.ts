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
