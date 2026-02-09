import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, splitLink, httpLink } from '@trpc/client';
import { useState } from 'react';
import superjson from 'superjson';

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

    // Debug: Log the tRPC URL to verify it's using the correct origin
    console.log('🔧 tRPC URL:', tRPCUrl);
    console.log('🌐 window.location.origin:', window.location.origin);

    return trpc.createClient({
      links: [
        splitLink({
          // Use GET for queries (httpLink), POST for mutations (httpBatchLink)
          condition: (op) => op.type === 'query',
          true: httpLink({
            url: tRPCUrl,
            transformer: superjson,
          }),
          false: httpBatchLink({
            url: tRPCUrl,
            transformer: superjson,
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
