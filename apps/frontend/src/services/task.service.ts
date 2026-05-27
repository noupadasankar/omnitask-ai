import { api } from './api';

export const taskService = {
  async getTasks() {
    const res = await api.get('/tasks');

    return res.data;
  },

  async createTask(data: {
    naturalLanguage: string;
  }) {
    const res = await api.post(
      '/tasks',
      data,
    );

    return res.data;
  },

  async executeTask(id: string) {
    const res = await api.post(
      `/tasks/${id}/execute`,
    );

    return res.data;
  },
};