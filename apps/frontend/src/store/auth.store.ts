'use client';

import { create } from 'zustand';
import { authApi, type User } from '@/lib/api';

/* ===========================================================
   STORE
=========================================================== */

interface AuthStore {
  user: User | null;
  loading: boolean;

  // Actions
  fetchUser: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  setUser: (user: User | null) => void;
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  loading: true,

  /* -------- Fetch Current User -------- */
  fetchUser: async () => {
    try {
      const token = localStorage.getItem('token');

      if (!token) {
        set({ user: null, loading: false });
        return;
      }

      const { data } = await authApi.me();

      set({ user: data, loading: false });
    } catch (error) {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      set({ user: null, loading: false });
    }
  },

  /* -------- Login -------- */
  login: async (email: string, password: string) => {
    try {
      const { data } = await authApi.login(email, password);

      localStorage.setItem('token', data.accessToken);
      if (data.refreshToken) {
        localStorage.setItem('refreshToken', data.refreshToken);
      }

      set({ user: data.user, loading: false });
    } catch (error) {
      set({ user: null, loading: false });
      throw error;
    }
  },

  /* -------- Logout -------- */
  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    set({ user: null });

    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  /* -------- Set User (for manual updates) -------- */
  setUser: (user: User | null) => {
    set({ user });
  },
}));

/* ===========================================================
   INIT ON CLIENT
   Auto-fetch user on first mount
=========================================================== */

if (typeof window !== 'undefined') {
  useAuthStore.getState().fetchUser();
}