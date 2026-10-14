import type {
  Account,
  AssetId,
  ClosedTrade,
  CloseReason,
  OrderRequest,
  PendingOrder,
  Position,
  Result,
  TradeErrorCode,
} from '../types';
import { EPSILON, isPositiveFinite } from '../math';
import {
  isLeverage,
  isLiquidatable,
  isStopLossHit,
  isTakeProfitHit,
  notionalValue,
  quantityFor,
  summarizeAccount,
  tradingFee,
  unrealizedPnl,
} from './calc';
import { MIN_ORDER_MARGIN, STARTING_BALANCE } from './constants';

export interface Clock {
  tick: number;
  /** Virtual market time in seconds. */
  time: number;
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: TradeErrorCode): Result<T> => ({ ok: false, error });

export function createAccount(balance = STARTING_BALANCE): Account {
  return { balance, positions: [], orders: [], trades: [], seq: 0 };
}

/** Validates a request against the current market and account. Pure. */
export function validateOrder(
  account: Account,
  request: OrderRequest,
  prices: Record<AssetId, number>,
): TradeErrorCode | null {
  const price = prices[request.assetId];
  if (price === undefined || !isPositiveFinite(price)) return 'unknownAsset';
  if (!isPositiveFinite(request.margin)) return 'invalidAmount';
  if (request.margin < MIN_ORDER_MARGIN) return 'amountTooSmall';
  if (!isLeverage(request.leverage)) return 'invalidLeverage';

  let reference = price;
  if (request.type === 'limit') {
    if (!isPositiveFinite(request.limitPrice)) return 'invalidLimitPrice';
    reference = request.limitPrice;
  }

  const fee = tradingFee(notionalValue(request.margin, request.leverage));
  const { freeMargin } = summarizeAccount(account, prices);
  if (request.margin + fee > freeMargin + EPSILON) return 'insufficientFunds';

  const isLong = request.side === 'long';
  if (request.stopLoss !== undefined) {
    if (!isPositiveFinite(request.stopLoss)) return 'invalidStopLoss';
    if (isLong ? request.stopLoss >= reference : request.stopLoss <= reference)
      return 'invalidStopLoss';
  }
  if (request.takeProfit !== undefined) {
    if (!isPositiveFinite(request.takeProfit)) return 'invalidTakeProfit';
    if (isLong ? request.takeProfit <= reference : request.takeProfit >= reference)
      return 'invalidTakeProfit';
  }
  return null;
}

function buildPosition(
  id: string,
  source: Pick<
    OrderRequest,
    'assetId' | 'side' | 'margin' | 'leverage' | 'stopLoss' | 'takeProfit'
  >,
  price: number,
  clock: Clock,
): Position {
  const position: Position = {
    id,
    assetId: source.assetId,
    side: source.side,
    entryPrice: price,
    quantity: quantityFor(source.margin, source.leverage, price),
    leverage: source.leverage,
    margin: source.margin,
    openFee: tradingFee(notionalValue(source.margin, source.leverage)),
    openedTick: clock.tick,
    openedAt: clock.time,
  };
  if (source.stopLoss !== undefined) position.stopLoss = source.stopLoss;
  if (source.takeProfit !== undefined) position.takeProfit = source.takeProfit;
  return position;
}

export type PlaceOrderOutcome =
  | { kind: 'position'; account: Account; position: Position }
  | { kind: 'order'; account: Account; order: PendingOrder };

/** Market orders open a position immediately; limit orders are queued and reserve margin + fee. */
export function placeOrder(
  account: Account,
  request: OrderRequest,
  prices: Record<AssetId, number>,
  clock: Clock,
): Result<PlaceOrderOutcome> {
  const error = validateOrder(account, request, prices);
  if (error) return fail(error);
  const seq = account.seq + 1;

  if (request.type === 'limit' && request.limitPrice !== undefined) {
    const order: PendingOrder = {
      id: `o-${seq}`,
      assetId: request.assetId,
      side: request.side,
      type: 'limit',
      limitPrice: request.limitPrice,
      margin: request.margin,
      leverage: request.leverage,
      reservedFee: tradingFee(notionalValue(request.margin, request.leverage)),
      createdTick: clock.tick,
      createdAt: clock.time,
    };
    if (request.stopLoss !== undefined) order.stopLoss = request.stopLoss;
    if (request.takeProfit !== undefined) order.takeProfit = request.takeProfit;
    return ok({
      kind: 'order',
      order,
      account: { ...account, seq, orders: [...account.orders, order] },
    });
  }

  const price = prices[request.assetId] as number;
  const position = buildPosition(`p-${seq}`, request, price, clock);
  return ok({
    kind: 'position',
    position,
    account: {
      ...account,
      seq,
      balance: account.balance - position.openFee,
      positions: [...account.positions, position],
    },
  });
}

/**
 * Closes a position at `price`. Losses are capped at the position margin
 * (isolated margin), so the balance can never go negative.
 */
export function closePosition(
  account: Account,
  positionId: string,
  price: number,
  clock: Clock,
  reason: CloseReason = 'manual',
): Result<{ account: Account; trade: ClosedTrade }> {
  const position = account.positions.find((p) => p.id === positionId);
  if (!position) return fail('positionNotFound');
  if (!isPositiveFinite(price)) return fail('unknownAsset');

  const gross = Math.max(unrealizedPnl(position, price), -position.margin);
  const closeFee = reason === 'liquidation' ? 0 : tradingFee(position.quantity * price);
  const realized = reason === 'liquidation' ? -position.margin : gross - closeFee;
  const seq = account.seq + 1;

  const trade: ClosedTrade = {
    id: `t-${seq}`,
    positionId: position.id,
    assetId: position.assetId,
    side: position.side,
    entryPrice: position.entryPrice,
    exitPrice: price,
    quantity: position.quantity,
    leverage: position.leverage,
    margin: position.margin,
    pnl: realized - position.openFee,
    fees: position.openFee + closeFee,
    reason,
    openedTick: position.openedTick,
    closedTick: clock.tick,
    openedAt: position.openedAt,
    closedAt: clock.time,
  };

  return ok({
    trade,
    account: {
      ...account,
      seq,
      balance: Math.max(0, account.balance + realized),
      positions: account.positions.filter((p) => p.id !== positionId),
      trades: [...account.trades, trade],
    },
  });
}

export function cancelOrder(
  account: Account,
  orderId: string,
): Result<{ account: Account; order: PendingOrder }> {
  const order = account.orders.find((o) => o.id === orderId);
  if (!order) return fail('orderNotFound');
  return ok({
    order,
    account: { ...account, orders: account.orders.filter((o) => o.id !== orderId) },
  });
}

export type TradeEvent =
  | { type: 'orderFilled'; order: PendingOrder; position: Position }
  | { type: 'positionClosed'; trade: ClosedTrade };

function isLimitTriggered(order: PendingOrder, price: number): boolean {
  return order.side === 'long' ? price <= order.limitPrice : price >= order.limitPrice;
}

/**
 * Runs once per market tick: fills limit orders, then checks liquidation,
 * stop-loss and take-profit (in that priority) for every open position.
 */
export function processTick(
  account: Account,
  prices: Record<AssetId, number>,
  clock: Clock,
): { account: Account; events: TradeEvent[] } {
  const events: TradeEvent[] = [];
  let next = account;

  // 1. Limit orders. Margin and fee were already reserved, so a fill cannot fail.
  for (const order of account.orders) {
    const price = prices[order.assetId];
    if (price === undefined || !isLimitTriggered(order, price)) continue;
    const seq = next.seq + 1;
    const position = buildPosition(`p-${seq}`, order, price, clock);
    position.openFee = order.reservedFee;
    next = {
      ...next,
      seq,
      balance: next.balance - order.reservedFee,
      orders: next.orders.filter((o) => o.id !== order.id),
      positions: [...next.positions, position],
    };
    events.push({ type: 'orderFilled', order, position });
  }

  // 2. Risk checks on open positions.
  for (const position of next.positions) {
    const price = prices[position.assetId];
    if (price === undefined) continue;
    let reason: CloseReason | null = null;
    if (isLiquidatable(position, price)) reason = 'liquidation';
    else if (isStopLossHit(position, price)) reason = 'stopLoss';
    else if (isTakeProfitHit(position, price)) reason = 'takeProfit';
    if (!reason) continue;

    const result = closePosition(next, position.id, price, clock, reason);
    if (result.ok) {
      next = result.value.account;
      events.push({ type: 'positionClosed', trade: result.value.trade });
    }
  }

  return { account: next, events };
}

/** No open exposure and not enough money left to place even the smallest order. */
export function isBankrupt(
  account: Account,
  prices: Record<AssetId, number>,
  threshold = MIN_ORDER_MARGIN,
): boolean {
  if (account.positions.length > 0 || account.orders.length > 0) {
    return summarizeAccount(account, prices).equity <= 0;
  }
  return account.balance < threshold;
}
