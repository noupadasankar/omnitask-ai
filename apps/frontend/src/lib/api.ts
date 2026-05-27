import { api } from '@/services/api';

export const authApi = {
  async login(
    email: string,
    password: string,
  ) {
    return api.post('/auth/login', {
      email,
      password,
    });
  },

  async register(data: {
    name: string;
    email: string;
    password: string;
  }) {
    return api.post(
      '/auth/register',
      data,
    );
  },

  async me() {
    return api.get('/auth/me');
  },
};