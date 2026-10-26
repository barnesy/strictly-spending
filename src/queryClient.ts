import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000, // 5 seconds so DB mutations immediately reflect across tabs & navigation
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

