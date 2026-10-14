import { QueryClient } from '@tanstack/react-query';
import type { LeaderboardPeriod, LeaderboardType } from '@trader-sim/shared';
import { isApiError } from './client';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        // Client errors (4xx) will not fix themselves – only retry network/server failures.
        retry: (count, error) =>
          count < 2 && !(isApiError(error) && error.status >= 400 && error.status < 500),
      },
      mutations: { retry: false },
    },
  });
}

export const queryKeys = {
  me: ['me'] as const,
  progress: ['me', 'progress'] as const,
  leaderboard: (type: LeaderboardType, period: LeaderboardPeriod, season?: string) =>
    ['leaderboard', type, period, season ?? 'current'] as const,
  leaderboardMe: (type: LeaderboardType, period: LeaderboardPeriod, season?: string) =>
    ['leaderboard', type, period, season ?? 'current', 'me'] as const,
  seasons: ['seasons'] as const,
  profile: (nickname: string) => ['profile', nickname.toLowerCase()] as const,
  friends: ['friends'] as const,
  friendRequests: ['friends', 'requests'] as const,
  daily: ['daily'] as const,
  providers: ['auth', 'providers'] as const,
};
