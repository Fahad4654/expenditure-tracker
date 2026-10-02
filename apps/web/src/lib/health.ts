import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { API_ROUTES } from '../shared/config';
import { apiFetch } from './api';

export interface LiveHealth {
  status: string;
  uptimeSeconds: number;
  timestamp: string;
}

export interface ReadyHealth {
  status: string;
  checks: Record<string, { status: 'up' | 'down'; latencyMs?: number }>;
}

/** Is the API process alive? Polled every 30s so status pills stay honest. */
export function useLiveHealth(): UseQueryResult<LiveHealth> {
  return useQuery({
    queryKey: ['health', 'live'],
    queryFn: ({ signal }) => apiFetch<LiveHealth>(API_ROUTES.health.live, { signal }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** Are dependencies reachable? A 503 lands in `error` — that *is* the signal. */
export function useReadyHealth(): UseQueryResult<ReadyHealth> {
  return useQuery({
    queryKey: ['health', 'ready'],
    queryFn: ({ signal }) => apiFetch<ReadyHealth>(API_ROUTES.health.ready, { signal }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}

/** Rolled-up state for the compact `● All systems operational` pill. */
export type HealthState = 'loading' | 'up' | 'down';

export function healthState(query: Pick<UseQueryResult, 'isPending' | 'isSuccess'>): HealthState {
  if (query.isPending) return 'loading';
  return query.isSuccess ? 'up' : 'down';
}
