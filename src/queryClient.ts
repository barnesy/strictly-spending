import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity, // Local desktop app, data only changes on mutations
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      refetchOnWindowFocus: false,
      refetchOnMount: true,
      refetchOnReconnect: false,
      retry: false,
    },
  },
});

if (typeof window !== 'undefined') {
  window.addEventListener('db-update', () => {
    queryClient.invalidateQueries();
  });
}

