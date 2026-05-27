'use client';

import { create } from 'zustand';

import { authApi } from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthStore {
  user: User | null;

  loading: boolean;

  fetchUser: () => Promise<void>;

  logout: () => void;
}

export const useAuthStore =
  create<AuthStore>((set) => ({
    user: null,

    loading: true,

    fetchUser: async () => {
      try {
        const token =
          localStorage.getItem('token');

        if (!token) {
          set({
            user: null,
            loading: false,
          });

          return;
        }

        const { data } =
          await authApi.me();

        set({
          user: data,
          loading: false,
        });
      } catch {
        localStorage.removeItem('token');

        set({
          user: null,
          loading: false,
        });
      }
    },

    logout: () => {
      localStorage.removeItem('token');

      set({
        user: null,
      });

      window.location.href = '/login';
    },
  }));