import type { LeaderboardMetric } from '@prisma/client';
import type { RunSummary } from '@trader-sim/engine';
import type { LeaderboardType } from '@trader-sim/shared';

/**
 * Single place that maps an API leaderboard type to its DB enum and to the
 * value taken from a verified run summary. Returning null skips the board.
 */
export const METRICS: Record<
  LeaderboardType,
  { db: LeaderboardMetric; value: (s: RunSummary) => number | null }
> = {
  equity: { db: 'EQUITY', value: (s) => s.finalEquity },
  roi: { db: 'ROI', value: (s) => s.roi },
  bestTrade: { db: 'BEST_TRADE', value: (s) => s.bestTrade },
  streak: { db: 'STREAK', value: (s) => (s.longestWinStreak > 0 ? s.longestWinStreak : null) },
  risk: { db: 'RISK', value: (s) => (s.totalTrades > 0 ? s.riskScore : null) },
};
