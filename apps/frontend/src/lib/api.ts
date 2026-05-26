import axios from 'axios';

const baseURL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ accessToken: string; user: { id: string; email: string; name?: string } }>(
      '/auth/login',
      { email, password },
    ),
  register: (email: string, password: string, name?: string) =>
    api.post<{ accessToken: string; user: { id: string; email: string } }>(
      '/auth/register',
      { email, password, name },
    ),
  profile: () => api.get('/auth/profile'),
};

export const tasksApi = {
  list: () => api.get('/tasks'),
  get: (id: string) => api.get(`/tasks/${id}`),
  create: (naturalLanguage: string, title?: string) =>
    api.post('/tasks', { naturalLanguage, title }),
  execute: (id: string) => api.post(`/tasks/${id}/execute`),
  cancel: (id: string) => api.put(`/tasks/${id}`, { status: 'CANCELLED' }),
};

export const executionsApi = {
  get: (id: string) => api.get(`/executions/${id}`),
  steps: (id: string) => api.get(`/executions/${id}/steps`),
};

export const healthApi = {
  get: () => api.get('/health'),
  systemInfo: () => api.get('/system/info'),
};

/** @deprecated use `api` */
export const apiClient = api;
