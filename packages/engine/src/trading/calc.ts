import type { Account, AccountSummary, AssetId, Leverage, Position, Side } from '../types';
import { safeDiv, sum } from '../math';
import { FEE_RATE, LEVERAGES, MAINTENANCE_MARGIN_RATIO } from './constants';

export function isLeverage(value: unknown): value is Leverage {
  return typeof value === 'number' && (LEVERAGES as readonly number[]).includes(value);
}

export function notionalValue(margin: number, leverage: number): number {
  return margin * leverage;
}

export function tradingFee(notional: number, rate = FEE_RATE): number {
  return Math.abs(notional) * rate;
}

export function quantityFor(margin: number, leverage: number, price: number): number {
  return safeDiv(notionalValue(margin, leverage), price);
}

type PnlInput = Pick<Position, 'side' | 'entryPrice' | 'quantity'>;

/** Gross unrealized P&L (fees excluded). */
export function unrealizedPnl(position: PnlInput, price: number): number {
  const diff = price - position.entryPrice;
  return (position.side === 'long' ? diff : -diff) * position.quantity;
}

/** Unrealized P&L as a percentage of margin (return on equity). */
export function pnlPercent(position: PnlInput & Pick<Position, 'margin'>, price: number): number {
  return safeDiv(unrealizedPnl(position, price), position.margin) * 100;
}

/**
 * Price at which `margin + pnl == margin * MAINTENANCE_MARGIN_RATIO`.
 *   long:  entry * (1 - (1 - mmr) / leverage)
 *   short: entry * (1 + (1 - mmr) / leverage)
 */
export function liquidationPrice(side: Side, entryPrice: number, leverage: number): number {
  const lev = leverage > 0 ? leverage : 1;
  const move = (1 - MAINTENANCE_MARGIN_RATIO) / lev;
  return side === 'long' ? entryPrice * (1 - move) : entryPrice * (1 + move);
}

export function isLiquidatable(position: Position, price: number): boolean {
  const remaining = position.margin + unrealizedPnl(position, price);
  return remaining <= position.margin * MAINTENANCE_MARGIN_RATIO;
}

export function isStopLossHit(position: Position, price: number): boolean {
  if (position.stopLoss === undefined) return false;
  return position.side === 'long' ? price <= position.stopLoss : price >= position.stopLoss;
}

export function isTakeProfitHit(position: Position, price: number): boolean {
  if (position.takeProfit === undefined) return false;
  return position.side === 'long' ? price >= position.takeProfit : price <= position.takeProfit;
}

/**
 * Largest margin that fits into `percent` of free margin once the opening fee
 * is accounted for, so "100%" never fails with insufficient funds.
 */
export function marginForPercent(freeMargin: number, percent: number, leverage: number): number {
  if (freeMargin <= 0 || percent <= 0) return 0;
  const budget = (freeMargin * Math.min(percent, 100)) / 100;
  return budget / (1 + leverage * FEE_RATE);
}

export function summarizeAccount(
  account: Account,
  prices: Record<AssetId, number>,
): AccountSummary {
  let unrealized = 0;
  for (const p of account.positions) {
    const price = prices[p.assetId];
    if (price !== undefined) unrealized += unrealizedPnl(p, price);
  }
  const usedMargin =
    sum(account.positions.map((p) => p.margin)) +
    sum(account.orders.map((o) => o.margin + o.reservedFee));
  const equity = account.balance + unrealized;
  return {
    balance: account.balance,
    equity,
    unrealizedPnl: unrealized,
    realizedPnl: sum(account.trades.map((t) => t.pnl)),
    usedMargin,
    freeMargin: Math.max(0, equity - usedMargin),
    marginLevel: usedMargin > 0 ? safeDiv(equity, usedMargin) * 100 : null,
    totalFees:
      sum(account.trades.map((t) => t.fees)) + sum(account.positions.map((p) => p.openFee)),
  };
}
