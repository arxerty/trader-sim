import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameAction } from '@trader-sim/engine';
import type { RunConfigDto, RunResultDto } from '@trader-sim/shared';
import { createSafeStorage } from './persistence/safeStorage';

/** A finish request that could not be delivered yet (offline) – retried on reconnect. */
export interface PendingFinish {
  runId: string;
  finalTick: number;
  finalEquity: number;
  engineVersion: string;
}

export interface RunStoreData {
  /** Server-issued config of the ranked run currently being played, if any. */
  run: RunConfigDto | null;
  /** Actions recorded locally and not yet acknowledged by the server (offline queue). */
  queue: GameAction[];
  pendingFinish: PendingFinish | null;
  lastResult: RunResultDto | null;
}

interface RunState extends RunStoreData {
  setRun: (run: RunConfigDto | null) => void;
  enqueue: (action: GameAction) => void;
  /** Drops the first `count` actions after the server accepted them. */
  acknowledge: (count: number) => void;
  setPendingFinish: (p: PendingFinish | null) => void;
  setLastResult: (r: RunResultDto | null) => void;
  clear: () => void;
}

const EMPTY: RunStoreData = { run: null, queue: [], pendingFinish: null, lastResult: null };

export const useRunStore = create<RunState>()(
  persist(
    (set) => ({
      ...EMPTY,
      setRun: (run) => set({ run, queue: [] }),
      enqueue: (action) => set((s) => ({ queue: [...s.queue, action] })),
      acknowledge: (count) => set((s) => ({ queue: s.queue.slice(count) })),
      setPendingFinish: (pendingFinish) => set({ pendingFinish }),
      setLastResult: (lastResult) => set({ lastResult }),
      clear: () => set({ run: null, queue: [], pendingFinish: null }),
    }),
    {
      name: 'trader-sim:run',
      version: 1,
      storage: createSafeStorage<RunStoreData>({ throttleMs: 500 }),
      partialize: ({ run, queue, pendingFinish, lastResult }) => ({
        run,
        queue,
        pendingFinish,
        lastResult,
      }),
      merge: (persisted, current) => {
        if (!persisted || typeof persisted !== 'object') return current;
        const p = persisted as Partial<RunStoreData>;
        return {
          ...current,
          run: p.run ?? null,
          queue: Array.isArray(p.queue) ? p.queue : [],
          pendingFinish: p.pendingFinish ?? null,
          lastResult: p.lastResult ?? null,
        };
      },
    },
  ),
);
