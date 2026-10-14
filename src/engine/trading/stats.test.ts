import { describe, expect, it } from 'vitest';
import type { ClosedTrade } from '@/types';
import { computeStats, longestWinStreak, maxDrawdown } from './stats';

const trade = (pnl: number, i = 0): ClosedTrade => ({
  id: `t-${i}`,
  positionId: `p-${i}`,
  assetId: 'NOVA',
  side: 'long',
  entryPrice: 100,
  exitPrice: 100,
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
});

describe('computeStats', () => {
  it('handles an empty history without NaN', () => {
    const s = computeStats([]);
    expect(s.winRate).toBe(0);
    expect(s.averagePnl).toBe(0);
    expect(s.bestTrade).toBeNull();
    expect(s.worstTrade).toBeNull();
    expect(s.maxDrawdown).toBe(0);
  });

  it('computes win rate, best/worst and averages', () => {
    const s = computeStats([100, -50, 200].map(trade));
    expect(s.totalTrades).toBe(3);
    expect(s.winRate).toBeCloseTo(2 / 3);
    expect(s.bestTrade).toBe(200);
    expect(s.worstTrade).toBe(-50);
    expect(s.averagePnl).toBeCloseTo(250 / 3);
    expect(s.averageWin).toBe(150);
    expect(s.averageLoss).toBe(-50);
  });
});

describe('maxDrawdown', () => {
  it('measures the largest peak-to-trough drop', () => {
    expect(maxDrawdown([100, 120, 90, 130, 65])).toBeCloseTo(0.5);
    expect(maxDrawdown([100, 110, 120])).toBe(0);
  });

  it('ignores invalid points and zero peaks', () => {
    expect(maxDrawdown([0, 0, Number.NaN])).toBe(0);
  });
});

describe('longestWinStreak', () => {
  it('counts consecutive winners', () => {
    expect(longestWinStreak([1, 2, -1, 3, 4, 5, 0].map(trade))).toBe(3);
  });
});
