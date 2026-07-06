'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { useEffect, useState } from 'react';

import { useAuthStore } from '@/store/auth.store';

export function Providers({
  children,
}: {
  children: React.ReactNode;
}) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  const fetchUser =
    useAuthStore(
      (state) => state.fetchUser,
    );

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  return (
    <QueryClientProvider client={client}>
      {children}
    </QueryClientProvider>
  );
}