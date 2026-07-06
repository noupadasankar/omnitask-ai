import { api } from './api';

export async function addEmailAccount(config: { provider: string; email: string; accessToken?: string; refreshToken?: string }) {
  const { data } = await api.post('/email/accounts', config);
  return data;
}

export async function listEmailAccounts() {
  const { data } = await api.get('/email/accounts');
  return data;
}

export async function removeEmailAccount(id: string) {
  await api.delete(`/email/accounts/${id}`);
}

export async function sendEmail(accountId: string, payload: { to: string[]; subject: string; body: string; cc?: string[]; bcc?: string[] }) {
  const { data } = await api.post(`/email/accounts/${accountId}/send`, payload);
  return data;
}

export async function listMessages(accountId: string, opts?: { limit?: number; folder?: string; search?: string }) {
  const { data } = await api.get(`/email/accounts/${accountId}/messages`, { params: opts });
  return data;
}

export async function composeDraft(accountId: string, payload: { to: string[]; subject: string; body: string }) {
  const { data } = await api.post(`/email/accounts/${accountId}/draft`, payload);
  return data;
}

export async function markAsRead(messageId: string) {
  await api.post(`/email/messages/${messageId}/read`);
}

export async function deleteMessage(messageId: string) {
  await api.delete(`/email/messages/${messageId}`);
}
