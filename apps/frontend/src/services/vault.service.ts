import { api } from './api';

export interface StoredCredential {
  id: string;
  service: string;
  label: string;
  hints: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export async function storeCredential(
  service: string,
  label: string,
  credentials: Record<string, string>,
  hints?: string,
): Promise<StoredCredential> {
  const { data } = await api.post('/vault/store', { service, label, credentials, hints });
  return data;
}

export async function getCredential(service: string): Promise<{ exists: boolean; credentials?: Record<string, string> }> {
  const { data } = await api.get(`/vault/${service}`);
  return data;
}

export async function listCredentials(): Promise<StoredCredential[]> {
  const { data } = await api.get('/vault');
  return data;
}

export async function deleteCredential(service: string): Promise<void> {
  await api.delete(`/vault/${service}`);
}
