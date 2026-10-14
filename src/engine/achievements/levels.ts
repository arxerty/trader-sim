import type { ClosedTrade, TraderLevel } from '@/types';
import { clamp, safeDiv } from '@/shared/lib/math';

export const LEVELS: readonly { level: TraderLevel; minXp: number }[] = [
  { level: 'novice', minXp: 0 },
  { level: 'amateur', minXp: 100 },
  { level: 'pro', minXp: 350 },
  { level: 'legend', minXp: 1000 },
];

export const XP_PER_TRADE = 5;
export const XP_PER_WIN = 5;

/** XP for one closed trade: participation + bonus for a profitable one. */
export function xpForTrade(trade: Pick<ClosedTrade, 'pnl'>): number {
  return XP_PER_TRADE + (trade.pnl > 0 ? XP_PER_WIN : 0);
}

export interface LevelProgress {
  level: TraderLevel;
  index: number;
  xp: number;
  currentLevelXp: number;
  nextLevelXp: number | null;
  /** 0..1 progress towards the next level (1 for the max level). */
  progress: number;
}

export function levelForXp(rawXp: number): LevelProgress {
  const xp = Number.isFinite(rawXp) ? Math.max(0, rawXp) : 0;
  let index = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (xp >= (LEVELS[i]?.minXp ?? Infinity)) index = i;
  }
  const current = LEVELS[index] ?? LEVELS[0]!;
  const next = LEVELS[index + 1];
  return {
    level: current.level,
    index,
    xp,
    currentLevelXp: current.minXp,
    nextLevelXp: next ? next.minXp : null,
    progress: next ? clamp(safeDiv(xp - current.minXp, next.minXp - current.minXp), 0, 1) : 1,
  };
}
