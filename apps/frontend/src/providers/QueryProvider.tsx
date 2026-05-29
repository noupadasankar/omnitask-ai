'use client';

import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import { ReactNode, useState } from 'react';

export function QueryProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 30,
            retry: 2,
            refetchOnWindowFocus: false,
            refetchOnReconnect: true,
          },

          mutations: {
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}