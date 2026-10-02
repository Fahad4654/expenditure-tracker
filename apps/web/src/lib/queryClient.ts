import { QueryClient } from '@tanstack/react-query';

/**
 * Cache for public, non-sensitive API reads (the health probes on the landing
 * page and /status). Authenticated pages keep using `apiFetch` + `useAsync`;
 * this client only ever touches endpoints that leak nothing about a user.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
