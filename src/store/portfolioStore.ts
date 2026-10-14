import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createAccount, STARTING_BALANCE } from '@/engine/trading';
import { createSafeStorage, markCorrupted } from './persistence/safeStorage';
import {
  migratePortfolio,
  sanitizePortfolio,
  SCHEMA_VERSIONS,
  STORAGE_KEYS,
  type PortfolioData,
} from './persistence/migrations';

export interface PortfolioState extends PortfolioData {
  update: (patch: Partial<PortfolioData>) => void;
  reset: () => void;
}

export function initialPortfolio(): PortfolioData {
  return {
    account: createAccount(STARTING_BALANCE),
    equityHistory: [STARTING_BALANCE],
    maxLeverageUsed: 1,
    bankrupt: false,
  };
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set) => ({
      ...initialPortfolio(),
      update: (patch) => set(patch),
      reset: () => set(initialPortfolio()),
    }),
    {
      name: STORAGE_KEYS.portfolio,
      version: SCHEMA_VERSIONS.portfolio,
      storage: createSafeStorage<PortfolioData>({ throttleMs: 1000 }),
      partialize: ({ account, equityHistory, maxLeverageUsed, bankrupt }) => ({
        account,
        equityHistory,
        maxLeverageUsed,
        bankrupt,
      }),
      migrate: (persisted, version) => migratePortfolio(persisted, version) as PortfolioData,
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) return current;
        const data = sanitizePortfolio(persisted);
        if (!data) {
          markCorrupted(STORAGE_KEYS.portfolio);
          return current;
        }
        return { ...current, ...data };
      },
    },
  ),
);
