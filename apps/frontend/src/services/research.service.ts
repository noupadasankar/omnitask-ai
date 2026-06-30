import { api } from './api';

export interface ResearchReport {
  id: string;
  title: string;
  kind: 'REPORT' | 'DOCUMENT' | 'DATA';
  mimeType: string;
  text: string | null;
  data: any;
  tags: string[];
  version: number;
  createdAt: string;
}

export async function getResearchReports(q?: string): Promise<ResearchReport[]> {
  const { data } = await api.get<ResearchReport[]>('/artifacts', {
    params: {
      kind: 'REPORT',
      q,
    },
  });
  return data;
}

export async function getResearchReport(id: string): Promise<ResearchReport> {
  const { data } = await api.get<ResearchReport>(`/artifacts/${id}`);
  return data;
}

export async function getReportHistory(title: string): Promise<ResearchReport[]> {
  const { data } = await api.get<ResearchReport[]>(`/artifacts/versions/${encodeURIComponent(title)}`);
  return data;
}

export async function getResearchStats(): Promise<any> {
  const { data } = await api.get<any>('/artifacts/stats');
  return data;
}
