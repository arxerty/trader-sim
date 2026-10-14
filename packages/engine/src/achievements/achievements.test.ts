import { describe, expect, it } from 'vitest';
import type { ClosedTrade } from '../types';
import { computeStats } from '../trading/stats';
import { evaluateAchievements, type AchievementContext } from './achievements';
import { levelForXp, xpForTrade } from './levels';

const trade = (pnl: number, extra: Partial<ClosedTrade> = {}): ClosedTrade => ({
  id: 't',
  positionId: 'p',
  assetId: 'NOVA',
  side: 'long',
  entryPrice: 1,
  exitPrice: 1,
  quantity: 1,
  leverage: 1,
  margin: 100,
  pnl,
  fees: 0,
  reason: 'manual',
  openedTick: 0,
  closedTick: 0,
  openedAt: 0,
  closedAt: 0,
  ...extra,
});

const ctx = (
  trades: ClosedTrade[],
  extra: Partial<AchievementContext> = {},
): AchievementContext => ({
  trades,
  stats: computeStats(trades),
  equity: 10_000,
  openPositions: 0,
  maxLeverageUsed: 1,
  ...extra,
});

describe('levels', () => {
  it('maps XP to levels', () => {
    expect(levelForXp(0)).toMatchObject({ level: 'novice', progress: 0 });
    expect(levelForXp(50).progress).toBeCloseTo(0.5);
    expect(levelForXp(100).level).toBe('amateur');
    expect(levelForXp(349).level).toBe('amateur');
    expect(levelForXp(350).level).toBe('pro');
    expect(levelForXp(5000)).toMatchObject({ level: 'legend', nextLevelXp: null, progress: 1 });
  });

  it('handles invalid XP', () => {
    expect(levelForXp(Number.NaN).level).toBe('novice');
    expect(levelForXp(-10).xp).toBe(0);
  });

  it('awards bonus XP for profitable trades', () => {
    expect(xpForTrade({ pnl: -1 })).toBe(5);
    expect(xpForTrade({ pnl: 1 })).toBe(10);
  });
});

describe('achievements', () => {
  it('unlocks first trade and first profit', () => {
    const ids = evaluateAchievements(ctx([trade(10)]), {}).map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(['firstTrade', 'firstProfit']));
    expect(ids).not.toContain('tenTrades');
  });

  it('skips already unlocked achievements', () => {
    const ids = evaluateAchievements(ctx([trade(10)]), { firstTrade: 1 }).map((a) => a.id);
    expect(ids).not.toContain('firstTrade');
  });

  it('detects special conditions', () => {
    const trades = [
      trade(600, { side: 'short', reason: 'takeProfit' }),
      trade(-20, { reason: 'stopLoss', assetId: 'BTCX' }),
      trade(-100, { reason: 'liquidation', assetId: 'AURM' }),
    ];
    const ids = evaluateAchievements(
      ctx(trades, { maxLeverageUsed: 10, openPositions: 3, equity: 20_000 }),
      {},
    ).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'bigWin',
        'bearHunter',
        'disciplined',
        'riskManager',
        'phoenix',
        'highRoller',
        'multitasker',
        'doubleUp',
      ]),
    );
  });

  it('requires five consecutive wins for a hot streak', () => {
    const four = [1, 1, 1, 1].map((p) => trade(p));
    expect(evaluateAchievements(ctx(four), {}).map((a) => a.id)).not.toContain('hotStreak');
    expect(evaluateAchievements(ctx([...four, trade(1)]), {}).map((a) => a.id)).toContain(
      'hotStreak',
    );
  });
});
