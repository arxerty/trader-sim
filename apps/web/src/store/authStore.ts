import { create } from 'zustand';
import type { Me } from '@trader-sim/shared';

export type AuthStatus = 'unknown' | 'guest' | 'authenticated';

/**
 * The access token lives only in memory (never in localStorage); the session
 * survives reloads via the httpOnly refresh cookie.
 */
interface AuthState {
  status: AuthStatus;
  user: Me | null;
  accessToken: string | null;
  setSession: (accessToken: string, user: Me) => void;
  setUser: (user: Me) => void;
  setGuest: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  status: 'unknown',
  user: null,
  accessToken: null,
  setSession: (accessToken, user) => set({ status: 'authenticated', accessToken, user }),
  setUser: (user) => set({ user }),
  setGuest: () => set({ status: 'guest', user: null, accessToken: null }),
}));
