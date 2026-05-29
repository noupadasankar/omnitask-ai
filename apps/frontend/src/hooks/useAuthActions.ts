import { useMutation } from '@tanstack/react-query';

import { authService } from '@/services/auth.service';

import { useAuthStore } from '@/store/auth.store';

export function useLogin() {
  const setUser =
    useAuthStore(
      (state) => state.setUser,
    );

  return useMutation({
    mutationFn: authService.login,

    onSuccess: (data: any) => {
      const result = data?.data ?? data;
      if (result.accessToken) {
        localStorage.setItem('token', result.accessToken);
      }
      if (result.refreshToken) {
        localStorage.setItem('refreshToken', result.refreshToken);
      }
      setUser(result.user);
    },
  });
}

export function useRegister() {
  const setUser =
    useAuthStore(
      (state) => state.setUser,
    );

  return useMutation({
    mutationFn:
      authService.register,

    onSuccess: (data: any) => {
      const result = data?.data ?? data;
      if (result.accessToken) {
        localStorage.setItem('token', result.accessToken);
      }
      if (result.refreshToken) {
        localStorage.setItem('refreshToken', result.refreshToken);
      }
      setUser(result.user);
    },
  });
}