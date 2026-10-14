import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import type { AccountSummary } from '@/types';
import { summarizeAccount } from '@/engine/trading';
import { levelForXp, type LevelProgress } from '@/engine/achievements';
import { useMarketStore } from './marketStore';
import { usePortfolioStore } from './portfolioStore';
import { useProgressStore } from './progressStore';

/**
 * Account summary that only recomputes when the account or the prices of
 * assets with open exposure change.
 */
export function useAccountSummary(): AccountSummary {
  const account = usePortfolioStore((s) => s.account);
  const exposedIds = useMemo(
    () => [
      ...new Set([
        ...account.positions.map((p) => p.assetId),
        ...account.orders.map((o) => o.assetId),
      ]),
    ],
    [account],
  );
  const exposedPrices = useMarketStore(
    useShallow((s) => exposedIds.map((id) => s.assets[id]?.price ?? 0)),
  );
  return useMemo(() => {
    const prices: Record<string, number> = {};
    exposedIds.forEach((id, i) => {
      prices[id] = exposedPrices[i] ?? 0;
    });
    return summarizeAccount(account, prices);
  }, [account, exposedIds, exposedPrices]);
}

export function useLevel(): LevelProgress {
  const xp = useProgressStore((s) => s.xp);
  return useMemo(() => levelForXp(xp), [xp]);
}
