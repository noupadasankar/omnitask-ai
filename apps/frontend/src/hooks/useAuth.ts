'use client';

import { useAuthStore } from '@/store/auth.store';

/**
 * Primary auth hook.
 * Returns user, loading state, and auth actions from the global store.
 */
export function useAuth() {
  const store = useAuthStore();

  return {
    user: store.user,
    loading: store.loading,
    isAuthenticated: !!store.user,
    login: store.login,
    logout: store.logout,
    setUser: store.setUser,
  };
}