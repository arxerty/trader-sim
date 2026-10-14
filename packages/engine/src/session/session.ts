import type {
  AchievementId,
  ClosedTrade,
  GameAction,
  NewsEvent,
  PendingOrder,
  Position,
  Result,
  RunConfig,
  RunSummary,
  SessionState,
} from '../types';
import { createMarket, isCandleBoundary, pricesOf, tickTime, advanceMarket } from '../market';
import type { PriceJump } from '../market';
import {
  cancelOrder,
  closePosition,
  computeStats,
  createAccount,
  isBankrupt,
  placeOrder,
  processTick,
  summarizeAccount,
  type Clock,
  type TradeEvent,
} from '../trading';
import { evaluateAchievements } from '../achievements';
import { safeDiv } from '../math';

/**
 * Bump whenever a change could alter simulation results. Runs played on a
 * different version are replayed but never ranked.
 */
export const ENGINE_VERSION = '2.0.0';

export const EQUITY_HISTORY_LIMIT = 1000;

export function createSession(
  config: Pick<RunConfig, 'seed' | 'startTime' | 'startingBalance'>,
): SessionState {
  return {
    market: createMarket(config.seed, { now: config.startTime }),
    account: createAccount(config.startingBalance),
    equityHistory: [config.startingBalance],
    maxLeverageUsed: 1,
    maxOpenPositions: 0,
    bankrupt: false,
  };
}

export function sessionClock(state: SessionState): Clock {
  return { tick: state.market.tick, time: tickTime(state.market.startTime, state.market.tick) };
}

export interface StepResult {
  state: SessionState;
  news: NewsEvent | null;
  jumps: PriceJump[];
  events: TradeEvent[];
  /** True on ticks where the equity curve was sampled. */
  candleClosed: boolean;
  /** True when this step made the player bankrupt. */
  becameBankrupt: boolean;
}

/** One market tick: prices, limit fills, liquidations, SL/TP, equity sampling, bankruptcy. */
export function stepSession(state: SessionState): StepResult {
  if (state.bankrupt) {
    return { state, news: null, jumps: [], events: [], candleClosed: false, becameBankrupt: false };
  }
  const step = advanceMarket(state.market);
  const prices = pricesOf(step.snapshot);
  const clock = {
    tick: step.snapshot.tick,
    time: tickTime(step.snapshot.startTime, step.snapshot.tick),
  };
  const { account, events } = processTick(state.account, prices, clock);

  const candleClosed = isCandleBoundary(clock.tick);
  const equityHistory = candleClosed
    ? [...state.equityHistory, summarizeAccount(account, prices).equity].slice(
        -EQUITY_HISTORY_LIMIT,
      )
    : state.equityHistory;
  const bankrupt = isBankrupt(account, prices);

  return {
    state: {
      ...state,
      market: step.snapshot,
      account,
      equityHistory,
      maxOpenPositions: Math.max(state.maxOpenPositions, account.positions.length),
      bankrupt,
    },
    news: step.news,
    jumps: step.jumps,
    events,
    candleClosed,
    becameBankrupt: bankrupt,
  };
}

export type ActionOutcome =
  | { kind: 'position'; position: Position }
  | { kind: 'order'; order: PendingOrder }
  | { kind: 'closed'; trade: ClosedTrade }
  | { kind: 'cancelled'; order: PendingOrder }
  | { kind: 'noop' };

export interface ApplyResult {
  state: SessionState;
  result: Result<ActionOutcome>;
}

/** Applies a player action at the current tick. Pure: failures leave the state unchanged. */
export function applyAction(state: SessionState, action: GameAction): ApplyResult {
  if (action.type === 'pause' || action.type === 'resume') {
    return { state, result: { ok: true, value: { kind: 'noop' } } };
  }
  if (state.bankrupt) return { state, result: { ok: false, error: 'marketClosed' } };
  const prices = pricesOf(state.market);
  const clock = sessionClock(state);

  switch (action.type) {
    case 'placeOrder': {
      const res = placeOrder(state.account, action.payload, prices, clock);
      if (!res.ok) return { state, result: res };
      const next: SessionState = {
        ...state,
        account: res.value.account,
        maxLeverageUsed: Math.max(state.maxLeverageUsed, action.payload.leverage),
        maxOpenPositions: Math.max(state.maxOpenPositions, res.value.account.positions.length),
      };
      const outcome: ActionOutcome =
        res.value.kind === 'position'
          ? { kind: 'position', position: res.value.position }
          : { kind: 'order', order: res.value.order };
      return { state: next, result: { ok: true, value: outcome } };
    }
    case 'closePosition': {
      const position = state.account.positions.find((p) => p.id === action.payload.positionId);
      if (!position) return { state, result: { ok: false, error: 'positionNotFound' } };
      const price = prices[position.assetId];
      if (price === undefined) return { state, result: { ok: false, error: 'unknownAsset' } };
      const res = closePosition(state.account, position.id, price, clock, 'manual');
      if (!res.ok) return { state, result: res };
      const next: SessionState = {
        ...state,
        account: res.value.account,
        bankrupt: isBankrupt(res.value.account, prices),
      };
      return {
        state: next,
        result: { ok: true, value: { kind: 'closed', trade: res.value.trade } },
      };
    }
    case 'cancelOrder': {
      const res = cancelOrder(state.account, action.payload.orderId);
      if (!res.ok) return { state, result: res };
      return {
        state: { ...state, account: res.value.account },
        result: { ok: true, value: { kind: 'cancelled', order: res.value.order } },
      };
    }
  }
}

/** Sharpe-like score of the equity curve: mean / stdev of candle returns × √n. */
export function riskScore(equityCurve: readonly number[]): number {
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1] as number;
    const cur = equityCurve[i] as number;
    if (prev > 0) returns.push(cur / prev - 1);
  }
  if (returns.length < 2) return 0;
  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1);
  const std = Math.sqrt(variance);
  if (std < 1e-12) return 0;
  return (mean / std) * Math.sqrt(returns.length);
}

/** Achievements earned within a single session (used by the server for ranked runs). */
export function sessionAchievements(state: SessionState): AchievementId[] {
  const prices = pricesOf(state.market);
  const peakEquity = Math.max(
    summarizeAccount(state.account, prices).equity,
    ...state.equityHistory,
  );
  return evaluateAchievements(
    {
      trades: state.account.trades,
      stats: computeStats(state.account.trades),
      equity: peakEquity,
      openPositions: state.maxOpenPositions,
      maxLeverageUsed: state.maxLeverageUsed,
    },
    {},
  ).map((a) => a.id);
}

export function summarizeSession(
  state: SessionState,
  startTick: number,
  startingBalance: number,
): RunSummary {
  const prices = pricesOf(state.market);
  const { equity } = summarizeAccount(state.account, prices);
  const finalEquity = Math.max(0, equity);
  const stats = computeStats(state.account.trades, state.equityHistory);
  return {
    finalEquity,
    roi: safeDiv(finalEquity - startingBalance, startingBalance),
    ticks: Math.max(0, state.market.tick - startTick),
    totalTrades: stats.totalTrades,
    winRate: stats.winRate,
    bestTrade: stats.bestTrade,
    longestWinStreak: stats.longestWinStreak,
    maxDrawdown: stats.maxDrawdown,
    riskScore: riskScore(state.equityHistory),
    bankrupt: state.bankrupt,
    achievements: sessionAchievements(state),
  };
}
