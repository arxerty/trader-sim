import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetId, MarketSnapshot } from '@/types';
import { createMarket } from '@trader-sim/engine';
import { createSeed } from '@/shared/lib/seed';
import { createSafeStorage, markCorrupted } from './persistence/safeStorage';
import {
  migrateMarket,
  sanitizeMarket,
  SCHEMA_VERSIONS,
  STORAGE_KEYS,
} from './persistence/migrations';

export interface MarketState extends MarketSnapshot {
  setSnapshot: (snapshot: MarketSnapshot) => void;
  /** New guest market; 
ow anchors virtual time (defaults to the real clock). */
  reset: (seed?: number, now?: number) => void;
}

export function toSnapshot(state: MarketSnapshot): MarketSnapshot {
  return {
    seed: state.seed,
    rngState: state.rngState,
    tick: state.tick,
    startTime: state.startTime,
    assets: state.assets,
    activeNews: state.activeNews,
    newsLog: state.newsLog,
    newsSeq: state.newsSeq,
  };
}

export const useMarketStore = create<MarketState>()(
  persist(
    (set) => ({
      ...createMarket(createSeed(), { now: Date.now() }),
      setSnapshot: (snapshot) => set(toSnapshot(snapshot)),
      reset: (seed = createSeed(), now = Date.now()) => set(createMarket(seed, { now })),
    }),
    {
      name: STORAGE_KEYS.market,
      version: SCHEMA_VERSIONS.market,
      // Prices change every tick; writing ~100 KB to disk each second would be wasteful.
      storage: createSafeStorage<MarketSnapshot>({ throttleMs: 3000 }),
      partialize: (state) => toSnapshot(state),
      migrate: (persisted, version) => migrateMarket(persisted, version) as MarketSnapshot,
      merge: (persisted, current) => {
        if (persisted === undefined || persisted === null) return current;
        const snapshot = sanitizeMarket(persisted);
        if (!snapshot) {
          markCorrupted(STORAGE_KEYS.market);
          return current;
        }
        return { ...current, ...snapshot };
      },
    },
  ),
);

/* Selectors – components subscribe to the narrowest slice they need. */
export const selectPrice =
  (assetId: AssetId) =>
  (s: MarketState): number | undefined =>
    s.assets[assetId]?.price;

export const selectSessionOpen =
  (assetId: AssetId) =>
  (s: MarketState): number | undefined =>
    s.assets[assetId]?.sessionOpen;

export const usePrice = (assetId: AssetId) => useMarketStore(selectPrice(assetId));

export function getPrices(): Record<AssetId, number> {
  const prices: Record<AssetId, number> = {};
  for (const [id, a] of Object.entries(useMarketStore.getState().assets)) prices[id] = a.price;
  return prices;
}
