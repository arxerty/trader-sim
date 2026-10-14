/** Domain types come from the shared engine; UI-only types live here. */
export type * from '@trader-sim/engine';

/** A finished local (guest) session in the on-device records table. */
export interface LeaderboardEntry {
  id: string;
  /** Real wall-clock time (ms) when the session ended. */
  date: number;
  finalEquity: number;
  returnPct: number;
  trades: number;
  winRate: number;
  bankrupt: boolean;
}

export type ThemeName = 'light' | 'dark' | 'terminal';
export type ThemePreference = ThemeName | 'system';
export type GameSpeed = 1 | 2 | 5;
