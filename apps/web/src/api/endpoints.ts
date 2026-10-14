import type {
  AuthResponse,
  CloudProgress,
  CloudSettings,
  DailyChallenge,
  Friend,
  FriendRequest,
  GameActionDto,
  GuestProgress,
  LeaderboardMe,
  LeaderboardPage,
  LeaderboardPeriod,
  LeaderboardType,
  LoginBody,
  Me,
  PublicProfile,
  RegisterBody,
  RunConfigDto,
  RunMode,
  RunResultDto,
  SettingsSync,
} from '@trader-sim/shared';
import { api } from './client';

/** Typed API surface – request/response types come from @trader-sim/shared. */
export const authApi = {
  register: (body: RegisterBody) =>
    api<AuthResponse>('/auth/register', { method: 'POST', body, auth: false }),
  login: (body: LoginBody) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body, auth: false }),
  logout: () => api<{ ok: true }>('/auth/logout', { method: 'POST', auth: false }),
  logoutAll: () => api<{ revoked: number }>('/auth/logout-all', { method: 'POST' }),
  verifyEmail: (token: string) =>
    api<{ ok: true }>('/auth/verify-email', { method: 'POST', body: { token }, auth: false }),
  resendVerification: () => api<{ ok: true }>('/auth/resend-verification', { method: 'POST' }),
  forgotPassword: (email: string) =>
    api<{ ok: true }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token: string, password: string) =>
    api<{ ok: true }>('/auth/reset-password', {
      method: 'POST',
      body: { token, password },
      auth: false,
    }),
  providers: () =>
    api<{ providers: Array<'google' | 'github'> }>('/auth/providers', { auth: false }),
};

export const meApi = {
  get: () => api<Me>('/me'),
  update: (body: Partial<Pick<Me, 'nickname' | 'avatar' | 'locale' | 'theme'>>) =>
    api<Me>('/me', { method: 'PATCH', body }),
  privacy: (hideFromLeaderboard: boolean) =>
    api<Me>('/me/privacy', { method: 'PATCH', body: { hideFromLeaderboard } }),
  settings: () => api<SettingsSync>('/me/settings'),
  putSettings: (settings: CloudSettings, baseVersion: number) =>
    api<SettingsSync>('/me/settings', { method: 'PUT', body: { settings, baseVersion } }),
  progress: () => api<CloudProgress>('/me/progress'),
  importGuest: (progress: GuestProgress) =>
    api<{ xp: number; achievements: number }>('/me/import-guest', {
      method: 'POST',
      body: progress,
    }),
  exportData: () => api<Record<string, unknown>>('/me/export'),
  remove: (password?: string, confirmNickname?: string) =>
    api<{ deleted: true }>('/me', { method: 'DELETE', body: { password, confirmNickname } }),
};

export const usersApi = {
  profile: (nickname: string) => api<PublicProfile>(`/users/${encodeURIComponent(nickname)}`),
};

export const runsApi = {
  create: (mode: RunMode) => api<RunConfigDto>('/runs', { method: 'POST', body: { mode } }),
  active: () => api<{ run: RunConfigDto | null }>('/runs/active'),
  actions: (runId: string, actions: GameActionDto[], clientTick: number) =>
    api<{ accepted: number; lastTick: number }>(`/runs/${runId}/actions`, {
      method: 'POST',
      body: { actions, clientTick },
    }),
  finish: (
    runId: string,
    body: {
      finalTick: number;
      engineVersion: string;
      actions: GameActionDto[];
      clientSummary: { finalEquity: number };
    },
  ) => api<RunResultDto>(`/runs/${runId}/finish`, { method: 'POST', body }),
  abandon: (runId: string) =>
    api<RunResultDto>(`/runs/${runId}/abandon`, { method: 'POST', body: {} }),
};

export interface LeaderboardParams {
  type: LeaderboardType;
  period: LeaderboardPeriod;
  season?: string;
  cursor?: string;
  limit?: number;
}

export const leaderboardApi = {
  page: ({ type, ...query }: LeaderboardParams) =>
    api<LeaderboardPage>(`/leaderboards/${type}`, { query: { ...query } }),
  me: ({ type, period, season }: LeaderboardParams) =>
    api<LeaderboardMe>(`/leaderboards/${type}/me`, { query: { period, season } }),
  seasons: () =>
    api<{ current: string; seasons: Array<{ key: string; startsAt: string; endsAt: string }> }>(
      '/seasons',
    ),
};

export const friendsApi = {
  list: () => api<{ friends: Friend[] }>('/friends'),
  requests: () => api<{ requests: FriendRequest[] }>('/friends/requests'),
  send: (nickname: string) =>
    api<FriendRequest>('/friends/requests', { method: 'POST', body: { nickname } }),
  accept: (id: string) =>
    api<{ ok: true }>(`/friends/requests/${id}/accept`, { method: 'POST', body: {} }),
  decline: (id: string) =>
    api<{ ok: true }>(`/friends/requests/${id}/decline`, { method: 'POST', body: {} }),
  remove: (nickname: string) =>
    api<{ ok: true }>(`/friends/${encodeURIComponent(nickname)}`, { method: 'DELETE' }),
};

export const dailyApi = {
  get: () => api<DailyChallenge>('/daily'),
};
