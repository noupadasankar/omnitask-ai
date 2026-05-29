import { api } from '@/services/api';

/* ===========================================================
   TYPES
=========================================================== */

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'USER' | 'VIEWER';
  avatar?: string;
  createdAt?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken?: string;
  user: User;
}

/* ===========================================================
   AUTH API
=========================================================== */

export const authApi = {
  login(email: string, password: string) {
    return api.post<AuthResponse>('/auth/login', { email, password });
  },

  register(data: { name: string; email: string; password: string }) {
    return api.post<AuthResponse>('/auth/register', data);
  },

  me() {
    return api.get<User>('/auth/me');
  },

  logout() {
    return api.post('/auth/logout');
  },

  forgotPassword(email: string) {
    return api.post('/auth/forgot-password', { email });
  },

  resetPassword(token: string, password: string) {
    return api.post('/auth/reset-password', { token, password });
  },

  verifyEmail(token: string) {
    return api.post('/auth/verify-email', { token });
  },

  refreshToken(refreshToken: string) {
    return api.post<AuthResponse>('/auth/refresh', { refreshToken });
  },
};

/* ===========================================================
   TASKS API
=========================================================== */

export const tasksApi = {
  list(params?: { status?: string; limit?: number; page?: number }) {
    return api.get('/tasks', { params });
  },

  get(id: string) {
    return api.get(`/tasks/${id}`);
  },

  create(data: {
    naturalLanguage: string;
    mode?: string;
    priority?: string;
  }) {
    return api.post('/tasks', data);
  },

  update(id: string, data: Partial<{ status: string; priority: string }>) {
    return api.patch(`/tasks/${id}`, data);
  },

  delete(id: string) {
    return api.delete(`/tasks/${id}`);
  },

  pause(id: string) {
    return api.post(`/tasks/${id}/pause`);
  },

  resume(id: string) {
    return api.post(`/tasks/${id}/resume`);
  },

  retry(id: string) {
    return api.post(`/tasks/${id}/retry`);
  },

  logs(id: string) {
    return api.get(`/tasks/${id}/logs`);
  },
};

/* ===========================================================
   AGENTS API
=========================================================== */

export const agentsApi = {
  list() {
    return api.get('/agents');
  },
  get(id: string) {
    return api.get(`/agents/${id}`);
  },
};

/* ===========================================================
   HEALTH API
=========================================================== */

export const healthApi = {
  runtime() {
    return api.get('/health/runtime');
  },
  status() {
    return api.get('/health/status');
  },
};