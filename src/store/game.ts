/**
 * Orchestration layer: wires pure engine functions to the zustand stores and
 * publishes game events. This is the only place that mutates several stores at once.
 */
import type {
  AchievementId,
  Account,
  AssetId,
  ClosedTrade,
  NewsEvent,
  OrderRequest,
  PendingOrder,
  Position,
  Result,
  TraderLevel,
} from '@/types';
import { advanceMarket, isCandleBoundary, pricesOf, tickTime } from '@/engine/market';
import {
  cancelOrder,
  closePosition,
  computeStats,
  isBankrupt,
  placeOrder,
  processTick,
  STARTING_BALANCE,
  summarizeAccount,
  type Clock,
} from '@/engine/trading';
import { evaluateAchievements, levelForXp, xpForTrade } from '@/engine/achievements';
import { EventBus } from '@/shared/lib/eventBus';
import { safeDiv } from '@/shared/lib/math';
import { getPrices, toSnapshot, useMarketStore } from './marketStore';
import { initialPortfolio, usePortfolioStore } from './portfolioStore';
import { useProgressStore } from './progressStore';
import { useSettingsStore } from './settingsStore';

export type GameEvent =
  | { type: 'positionOpened'; position: Position }
  | { type: 'orderPlaced'; order: PendingOrder }
  | { type: 'orderFilled'; position: Position }
  | { type: 'orderCancelled'; order: PendingOrder }
  | { type: 'positionClosed'; trade: ClosedTrade }
  | { type: 'news'; news: NewsEvent }
  | { type: 'achievement'; id: AchievementId }
  | { type: 'levelUp'; level: TraderLevel }
  | { type: 'bankrupt' };

export const gameEvents = new EventBus<GameEvent>();

const EQUITY_HISTORY_LIMIT = 1000;

function currentClock(): Clock {
  const { tick, startTime } = useMarketStore.getState();
  return { tick, time: tickTime(startTime, tick) };
}

function grantXp(amount: number): void {
  const progress = useProgressStore.getState();
  const before = levelForXp(progress.xp);
  progress.addXp(amount);
  const after = levelForXp(useProgressStore.getState().xp);
  if (after.index > before.index) gameEvents.emit({ type: 'levelUp', level: after.level });
}

function checkAchievements(account: Account, prices: Record<AssetId, number>): void {
  const { maxLeverageUsed } = usePortfolioStore.getState();
  const progress = useProgressStore.getState();
  const unlockedNow = evaluateAchievements(
    {
      trades: account.trades,
      stats: computeStats(account.trades),
      equity: summarizeAccount(account, prices).equity,
      openPositions: account.positions.length,
      maxLeverageUsed,
    },
    progress.unlocked,
  );
  if (unlockedNow.length === 0) return;
  progress.unlock(
    unlockedNow.map((a) => a.id),
    Date.now(),
  );
  for (const a of unlockedNow) gameEvents.emit({ type: 'achievement', id: a.id });
  grantXp(unlockedNow.reduce((total, a) => total + a.xp, 0));
}

function onTradesClosed(trades: readonly ClosedTrade[]): void {
  if (trades.length === 0) return;
  grantXp(trades.reduce((total, t) => total + xpForTrade(t), 0));
}

/** Saves the session result to the leaderboard. */
function recordSession(account: Account, bankrupt: boolean): void {
  if (account.trades.length === 0 && !bankrupt) return;
  const prices = getPrices();
  const { equity } = summarizeAccount(account, prices);
  const stats = computeStats(account.trades);
  useProgressStore.getState().addLeaderboardEntry({
    id: `s-${Date.now()}`,
    date: Date.now(),
    finalEquity: Math.max(0, equity),
    returnPct: safeDiv(equity - STARTING_BALANCE, STARTING_BALANCE),
    trades: stats.totalTrades,
    winRate: stats.winRate,
    bankrupt,
  });
}

function declareBankruptcy(account: Account): void {
  usePortfolioStore.getState().update({ bankrupt: true });
  recordSession(account, true);
  gameEvents.emit({ type: 'bankrupt' });
}

/** One iteration of the game loop. */
export function runTick(): void {
  const portfolio = usePortfolioStore.getState();
  if (portfolio.bankrupt) return;

  const step = advanceMarket(toSnapshot(useMarketStore.getState()));
  useMarketStore.getState().setSnapshot(step.snapshot);
  if (step.news) gameEvents.emit({ type: 'news', news: step.news });

  const prices = pricesOf(step.snapshot);
  const clock = {
    tick: step.snapshot.tick,
    time: tickTime(step.snapshot.startTime, step.snapshot.tick),
  };
  const { account, events } = processTick(portfolio.account, prices, clock);

  const boundary = isCandleBoundary(clock.tick);
  const patch: Partial<typeof portfolio> = {};
  if (account !== portfolio.account) patch.account = account;
  if (boundary) {
    patch.equityHistory = [
      ...portfolio.equityHistory,
      summarizeAccount(account, prices).equity,
    ].slice(-EQUITY_HISTORY_LIMIT);
  }
  if (Object.keys(patch).length > 0) portfolio.update(patch);

  const closed: ClosedTrade[] = [];
  for (const e of events) {
    if (e.type === 'orderFilled') gameEvents.emit({ type: 'orderFilled', position: e.position });
    else {
      closed.push(e.trade);
      gameEvents.emit({ type: 'positionClosed', trade: e.trade });
    }
  }
  onTradesClosed(closed);
  if (events.length > 0 || boundary) checkAchievements(account, prices);

  if (isBankrupt(account, prices)) declareBankruptcy(account);
}

export function submitOrder(request: OrderRequest): Result<Position | PendingOrder> {
  const portfolio = usePortfolioStore.getState();
  if (portfolio.bankrupt) return { ok: false, error: 'marketClosed' };
  const prices = getPrices();
  const result = placeOrder(portfolio.account, request, prices, currentClock());
  if (!result.ok) return result;

  const outcome = result.value;
  portfolio.update({
    account: outcome.account,
    maxLeverageUsed: Math.max(portfolio.maxLeverageUsed, request.leverage),
  });
  if (outcome.kind === 'position') {
    gameEvents.emit({ type: 'positionOpened', position: outcome.position });
    checkAchievements(outcome.account, prices);
    return { ok: true, value: outcome.position };
  }
  gameEvents.emit({ type: 'orderPlaced', order: outcome.order });
  return { ok: true, value: outcome.order };
}

export function closePositionById(positionId: string): Result<ClosedTrade> {
  const portfolio = usePortfolioStore.getState();
  const position = portfolio.account.positions.find((p) => p.id === positionId);
  if (!position) return { ok: false, error: 'positionNotFound' };
  const prices = getPrices();
  const price = prices[position.assetId];
  if (price === undefined) return { ok: false, error: 'unknownAsset' };

  const result = closePosition(portfolio.account, positionId, price, currentClock(), 'manual');
  if (!result.ok) return result;
  portfolio.update({ account: result.value.account });
  gameEvents.emit({ type: 'positionClosed', trade: result.value.trade });
  onTradesClosed([result.value.trade]);
  checkAchievements(result.value.account, prices);
  if (isBankrupt(result.value.account, prices)) declareBankruptcy(result.value.account);
  return { ok: true, value: result.value.trade };
}

export function cancelOrderById(orderId: string): Result<PendingOrder> {
  const portfolio = usePortfolioStore.getState();
  const result = cancelOrder(portfolio.account, orderId);
  if (!result.ok) return result;
  portfolio.update({ account: result.value.account });
  gameEvents.emit({ type: 'orderCancelled', order: result.value.order });
  return { ok: true, value: result.value.order };
}

/** Ends the current session (recording it if it was not recorded on bankruptcy) and starts a new one. */
export function restartGame(seed?: number): void {
  const portfolio = usePortfolioStore.getState();
  if (!portfolio.bankrupt) recordSession(portfolio.account, false);
  useMarketStore.getState().reset(seed);
  usePortfolioStore.setState(initialPortfolio());
  useSettingsStore.getState().setPaused(false);
}
