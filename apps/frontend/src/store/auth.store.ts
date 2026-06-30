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
        document.cookie = 'has_session=; path=/; max-age=0; SameSite=Lax';
        set({ user: null, loading: false });
        return;
      }

      const { data } = await authApi.me();
      document.cookie = 'has_session=1; path=/; max-age=86400; SameSite=Lax';
      if (data?.id) {
        localStorage.setItem('userId', data.id);
      }
      set({ user: data, loading: false });
    } catch {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      document.cookie = 'has_session=; path=/; max-age=0; SameSite=Lax';
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
      if (data.user?.id) {
        localStorage.setItem('userId', data.user.id);
      }
      document.cookie = 'has_session=1; path=/; max-age=86400; SameSite=Lax';
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
    localStorage.removeItem('userId');
    document.cookie = 'has_session=; path=/; max-age=0; SameSite=Lax';
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