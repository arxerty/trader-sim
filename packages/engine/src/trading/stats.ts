import type { ClosedTrade, TradingStats } from '../types';
import { safeDiv, sum } from '../math';

/** Max peak-to-trough decline of an equity curve as a fraction (0..1). */
export function maxDrawdown(equityCurve: readonly number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const value of equityCurve) {
    if (!Number.isFinite(value)) continue;
    if (value > peak) peak = value;
    if (peak > 0) worst = Math.max(worst, (peak - value) / peak);
  }
  return worst;
}

export function longestWinStreak(trades: readonly ClosedTrade[]): number {
  let best = 0;
  let current = 0;
  for (const t of trades) {
    current = t.pnl > 0 ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

export function computeStats(
  trades: readonly ClosedTrade[],
  equityCurve: readonly number[] = [],
): TradingStats {
  const pnls = trades.map((t) => t.pnl);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p <= 0);
  return {
    totalTrades: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: safeDiv(wins.length, trades.length),
    bestTrade: pnls.length ? Math.max(...pnls) : null,
    worstTrade: pnls.length ? Math.min(...pnls) : null,
    averagePnl: safeDiv(sum(pnls), pnls.length),
    averageWin: safeDiv(sum(wins), wins.length),
    averageLoss: safeDiv(sum(losses), losses.length),
    totalPnl: sum(pnls),
    maxDrawdown: maxDrawdown(equityCurve),
    longestWinStreak: longestWinStreak(trades),
  };
}
