import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, splitLink, httpLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

import { getAccessToken } from '../auth/tokenStore';

import { trpc } from './client';

interface TrpcProviderProps {
  children: React.ReactNode;
}

export function TrpcProvider({ children }: TrpcProviderProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  const [trpcClient] = useState(() => {
    const tRPCUrl = import.meta.env.VITE_API_URL
      ? `${import.meta.env.VITE_API_URL}/trpc`
      : `${window.location.origin}/trpc`;

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('tRPC URL:', tRPCUrl);
    }

    return trpc.createClient({
      links: [
        splitLink({
          // Use GET for queries (httpLink), POST for mutations (httpBatchLink)
          condition: (op) => op.type === 'query',
          true: httpLink({
            url: tRPCUrl,
            transformer: superjson,
            headers: () => {
              const token = getAccessToken();
              return {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              };
            },
            // Include credentials so the browser accepts Set-Cookie headers
            // from the server (needed for HttpOnly refresh token cookie).
            fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'include' }),
          }),
          false: httpBatchLink({
            url: tRPCUrl,
            transformer: superjson,
            headers: () => {
              const token = getAccessToken();
              return {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
                'X-CSRF-Protection': '1',
              };
            },
            fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: 'include' }),
          }),
        }),
      ],
    });
  });

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpc.Provider>
  );
}
