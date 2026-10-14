import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AchievementId, LeaderboardEntry } from '@/types';
import { createSafeStorage } from './persistence/safeStorage';
import {
  LEADERBOARD_SIZE,
  sanitizeProgress,
  SCHEMA_VERSIONS,
  STORAGE_KEYS,
  type ProgressData,
} from './persistence/migrations';

export interface ProgressState extends ProgressData {
  addXp: (amount: number) => void;
  unlock: (ids: readonly AchievementId[], at: number) => void;
  addLeaderboardEntry: (entry: LeaderboardEntry) => void;
  resetProgress: () => void;
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set) => ({
      xp: 0,
      unlocked: {},
      leaderboard: [],
      addXp: (amount) => {
        if (!Number.isFinite(amount) || amount <= 0) return;
        set((s) => ({ xp: s.xp + amount }));
      },
      unlock: (ids, at) =>
        set((s) => {
          const unlocked = { ...s.unlocked };
          for (const id of ids) unlocked[id] ??= at;
          return { unlocked };
        }),
      addLeaderboardEntry: (entry) =>
        set((s) => ({
          leaderboard: [...s.leaderboard, entry]
            .sort((a, b) => b.finalEquity - a.finalEquity)
            .slice(0, LEADERBOARD_SIZE),
        })),
      resetProgress: () => set({ xp: 0, unlocked: {}, leaderboard: [] }),
    }),
    {
      name: STORAGE_KEYS.progress,
      version: SCHEMA_VERSIONS.progress,
      storage: createSafeStorage<ProgressData>(),
      partialize: ({ xp, unlocked, leaderboard }) => ({ xp, unlocked, leaderboard }),
      migrate: (persisted) => sanitizeProgress(persisted),
      merge: (persisted, current) =>
        persisted === undefined ? current : { ...current, ...sanitizeProgress(persisted) },
    },
  ),
);
