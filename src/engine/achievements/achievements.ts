import type { AchievementId, ClosedTrade, TradingStats } from '@/types';
import { STARTING_BALANCE } from '../trading/constants';

export interface AchievementContext {
  trades: readonly ClosedTrade[];
  stats: TradingStats;
  equity: number;
  openPositions: number;
  maxLeverageUsed: number;
}

export interface AchievementDefinition {
  id: AchievementId;
  xp: number;
  /** Optional goal shown in the description via `{{count}}` (pluralised). */
  goal?: number;
  icon: string;
  check: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  { id: 'firstTrade', xp: 10, icon: '🎯', check: (c) => c.trades.length >= 1 },
  { id: 'firstProfit', xp: 15, icon: '💵', check: (c) => c.trades.some((t) => t.pnl > 0) },
  { id: 'tenTrades', xp: 25, goal: 10, icon: '📈', check: (c) => c.trades.length >= 10 },
  { id: 'fiftyTrades', xp: 60, goal: 50, icon: '🏛️', check: (c) => c.trades.length >= 50 },
  { id: 'bigWin', xp: 40, goal: 500, icon: '💰', check: (c) => c.trades.some((t) => t.pnl >= 500) },
  { id: 'highRoller', xp: 20, goal: 10, icon: '🎲', check: (c) => c.maxLeverageUsed >= 10 },
  {
    id: 'bearHunter',
    xp: 25,
    icon: '🐻',
    check: (c) => c.trades.some((t) => t.side === 'short' && t.pnl > 0),
  },
  {
    id: 'diversified',
    xp: 30,
    goal: 5,
    icon: '🧺',
    check: (c) => new Set(c.trades.map((t) => t.assetId)).size >= 5,
  },
  { id: 'hotStreak', xp: 50, goal: 5, icon: '🔥', check: (c) => c.stats.longestWinStreak >= 5 },
  {
    id: 'disciplined',
    xp: 20,
    icon: '✅',
    check: (c) => c.trades.some((t) => t.reason === 'takeProfit'),
  },
  {
    id: 'riskManager',
    xp: 20,
    icon: '🛡️',
    check: (c) => c.trades.some((t) => t.reason === 'stopLoss'),
  },
  {
    id: 'phoenix',
    xp: 50,
    icon: '🦅',
    check: (c) => c.trades.some((t) => t.reason === 'liquidation') && c.equity >= STARTING_BALANCE,
  },
  { id: 'doubleUp', xp: 100, icon: '🚀', check: (c) => c.equity >= STARTING_BALANCE * 2 },
  { id: 'multitasker', xp: 15, goal: 3, icon: '🧩', check: (c) => c.openPositions >= 3 },
];

/** Returns achievements that are satisfied now but not yet unlocked. */
export function evaluateAchievements(
  ctx: AchievementContext,
  unlocked: Partial<Record<AchievementId, number>>,
): AchievementDefinition[] {
  return ACHIEVEMENTS.filter((a) => unlocked[a.id] === undefined && a.check(ctx));
}

export function getAchievement(id: AchievementId): AchievementDefinition | undefined {
  return ACHIEVEMENTS.find((a) => a.id === id);
}
