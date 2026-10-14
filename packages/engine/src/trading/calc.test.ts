import { describe, expect, it } from 'vitest';
import { accountWith, makePosition } from '../test/fixtures';
import {
  isLiquidatable,
  isStopLossHit,
  isTakeProfitHit,
  liquidationPrice,
  marginForPercent,
  notionalValue,
  pnlPercent,
  quantityFor,
  summarizeAccount,
  tradingFee,
  unrealizedPnl,
} from './calc';
import { FEE_RATE } from './constants';

describe('basic calculations', () => {
  it('computes notional, fee and quantity', () => {
    expect(notionalValue(1000, 5)).toBe(5000);
    expect(tradingFee(5000)).toBeCloseTo(5);
    expect(tradingFee(-5000)).toBeCloseTo(5);
    expect(quantityFor(1000, 5, 100)).toBe(50);
  });

  it('never divides by zero', () => {
    expect(quantityFor(1000, 5, 0)).toBe(0);
    expect(pnlPercent(makePosition({ margin: 0 }), 110)).toBe(0);
  });
});

describe('P&L', () => {
  it('long profits when price rises', () => {
    const p = makePosition({ side: 'long' });
    expect(unrealizedPnl(p, 110)).toBeCloseTo(500);
    expect(unrealizedPnl(p, 90)).toBeCloseTo(-500);
    expect(pnlPercent(p, 110)).toBeCloseTo(50);
  });

  it('short profits when price falls', () => {
    const p = makePosition({ side: 'short' });
    expect(unrealizedPnl(p, 90)).toBeCloseTo(500);
    expect(unrealizedPnl(p, 110)).toBeCloseTo(-500);
  });
});

describe('liquidation', () => {
  it('computes liquidation price from leverage', () => {
    expect(liquidationPrice('long', 100, 10)).toBeCloseTo(91);
    expect(liquidationPrice('short', 100, 10)).toBeCloseTo(109);
    expect(liquidationPrice('long', 100, 1)).toBeCloseTo(10);
    expect(liquidationPrice('long', 100, 0)).toBeCloseTo(10); // guarded
  });

  it('liquidates when remaining margin hits the maintenance level', () => {
    const p = makePosition({ leverage: 10, margin: 1000, quantity: 100 });
    expect(isLiquidatable(p, 91.5)).toBe(false);
    expect(isLiquidatable(p, 91)).toBe(true);
    expect(isLiquidatable(p, 50)).toBe(true);
  });
});

describe('stop-loss / take-profit triggers', () => {
  it('long', () => {
    const p = makePosition({ stopLoss: 95, takeProfit: 120 });
    expect(isStopLossHit(p, 96)).toBe(false);
    expect(isStopLossHit(p, 95)).toBe(true);
    expect(isTakeProfitHit(p, 119)).toBe(false);
    expect(isTakeProfitHit(p, 120)).toBe(true);
  });

  it('short', () => {
    const p = makePosition({ side: 'short', stopLoss: 105, takeProfit: 80 });
    expect(isStopLossHit(p, 106)).toBe(true);
    expect(isTakeProfitHit(p, 79)).toBe(true);
    expect(isTakeProfitHit(p, 81)).toBe(false);
  });

  it('ignores missing levels', () => {
    const p = makePosition();
    expect(isStopLossHit(p, 1)).toBe(false);
    expect(isTakeProfitHit(p, 1e9)).toBe(false);
  });
});

describe('marginForPercent', () => {
  it('leaves room for the opening fee so 100% always fits', () => {
    const margin = marginForPercent(10_000, 100, 10);
    expect(margin + tradingFee(notionalValue(margin, 10))).toBeCloseTo(10_000, 6);
  });

  it('scales with the percentage', () => {
    expect(marginForPercent(10_000, 25, 1)).toBeCloseTo(2500 / (1 + FEE_RATE));
  });

  it('returns 0 for empty or negative free margin', () => {
    expect(marginForPercent(0, 50, 1)).toBe(0);
    expect(marginForPercent(-100, 50, 1)).toBe(0);
  });
});

describe('summarizeAccount', () => {
  it('aggregates equity, used and free margin', () => {
    const account = accountWith([makePosition()], 9995);
    const s = summarizeAccount(account, { NOVA: 110 });
    expect(s.unrealizedPnl).toBeCloseTo(500);
    expect(s.equity).toBeCloseTo(10_495);
    expect(s.usedMargin).toBe(1000);
    expect(s.freeMargin).toBeCloseTo(9495);
    expect(s.marginLevel).toBeCloseTo(1049.5);
  });

  it('has no margin level without exposure and never negative free margin', () => {
    const s = summarizeAccount(accountWith([], 0), {});
    expect(s.marginLevel).toBeNull();
    expect(s.freeMargin).toBe(0);
  });

  it('skips positions with unknown prices', () => {
    const s = summarizeAccount(accountWith([makePosition({ assetId: 'GONE' })]), {});
    expect(s.unrealizedPnl).toBe(0);
  });
});
