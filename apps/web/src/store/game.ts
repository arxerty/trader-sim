/**
 * Orchestration layer: wires the engine session (shared with the server's
 * replay) to the zustand stores and publishes game events. Every state change
 * goes through `stepSession` / `applyAction`, so a ranked run's action log
 * reproduces exactly the same result on the server.
 */
import type {
  AchievementId,
  Account,
  AssetId,
  ClosedTrade,
  GameAction,
  NewsEvent,
  OrderRequest,
  PendingOrder,
  Position,
  Result,
  RunConfig,
  SessionState,
  TraderLevel,
} from '@/types';
import {
  applyAction,
  computeStats,
  createSession,
  evaluateAchievements,
  levelForXp,
  pricesOf,
  safeDiv,
  STARTING_BALANCE,
  stepSession,
  summarizeAccount,
  xpForTrade,
} from '@trader-sim/engine';
import { EventBus } from '@/shared/lib/eventBus';
import { getPrices, toSnapshot, useMarketStore } from './marketStore';
import { initialPortfolio, usePortfolioStore, type PortfolioState } from './portfolioStore';
import { useProgressStore } from './progressStore';
import { useSettingsStore } from './settingsStore';
import { useRunStore } from './runStore';

export type GameEvent =
  | { type: 'positionOpened'; position: Position }
  | { type: 'orderPlaced'; order: PendingOrder }
  | { type: 'orderFilled'; position: Position }
  | { type: 'orderCancelled'; order: PendingOrder }
  | { type: 'positionClosed'; trade: ClosedTrade }
  | { type: 'news'; news: NewsEvent }
  | { type: 'achievement'; id: AchievementId }
  | { type: 'levelUp'; level: TraderLevel }
  | { type: 'bankrupt' }
  /** A ranked run went bankrupt or used up its ticks and must be submitted. */
  | { type: 'runEnded' };

export const gameEvents = new EventBus<GameEvent>();

/* ------------------------------------------------------------ session bridge */

export function currentSession(): SessionState {
  const p = usePortfolioStore.getState();
  return {
    market: toSnapshot(useMarketStore.getState()),
    account: p.account,
    equityHistory: p.equityHistory,
    maxLeverageUsed: p.maxLeverageUsed,
    maxOpenPositions: p.maxOpenPositions,
    bankrupt: p.bankrupt,
  };
}

function commit(next: SessionState, prev: SessionState): void {
  if (next.market !== prev.market) useMarketStore.getState().setSnapshot(next.market);
  const patch: Partial<PortfolioState> = {};
  if (next.account !== prev.account) patch.account = next.account;
  if (next.equityHistory !== prev.equityHistory) patch.equityHistory = next.equityHistory;
  if (next.maxLeverageUsed !== prev.maxLeverageUsed) patch.maxLeverageUsed = next.maxLeverageUsed;
  if (next.maxOpenPositions !== prev.maxOpenPositions)
    patch.maxOpenPositions = next.maxOpenPositions;
  if (next.bankrupt !== prev.bankrupt) patch.bankrupt = next.bankrupt;
  if (Object.keys(patch).length > 0) usePortfolioStore.getState().update(patch);
}

/** The ranked run the current market belongs to, if any. */
export function activeRankedRun() {
  const { run } = useRunStore.getState();
  if (!run) return null;
  return run.seed === useMarketStore.getState().seed && !useRunStore.getState().pendingFinish
    ? run
    : null;
}

function record(action: GameAction): void {
  if (activeRankedRun()) useRunStore.getState().enqueue(action);
}

/* ---------------------------------------------------------- local progress */

function grantXp(amount: number): void {
  const progress = useProgressStore.getState();
  const before = levelForXp(progress.xp);
  progress.addXp(amount);
  const after = levelForXp(useProgressStore.getState().xp);
  if (after.index > before.index) gameEvents.emit({ type: 'levelUp', level: after.level });
}

function checkAchievements(account: Account, prices: Record<AssetId, number>): void {
  const { maxLeverageUsed, maxOpenPositions } = usePortfolioStore.getState();
  const progress = useProgressStore.getState();
  const unlockedNow = evaluateAchievements(
    {
      trades: account.trades,
      stats: computeStats(account.trades),
      equity: summarizeAccount(account, prices).equity,
      openPositions: Math.max(account.positions.length, maxOpenPositions),
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

/** Saves the session result to the on-device records table. */
function recordLocalSession(account: Account, bankrupt: boolean): void {
  if (account.trades.length === 0 && !bankrupt) return;
  const { equity } = summarizeAccount(account, getPrices());
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
  recordLocalSession(account, true);
  gameEvents.emit({ type: 'bankrupt' });
  if (activeRankedRun()) gameEvents.emit({ type: 'runEnded' });
}

/* ------------------------------------------------------------------- loop */

/** True when the ranked run has used up its tick budget. */
export function rankedRunExhausted(): boolean {
  const run = activeRankedRun();
  return Boolean(run && useMarketStore.getState().tick >= run.startTick + run.maxTicks);
}

/** One iteration of the game loop. */
export function runTick(): void {
  const prev = currentSession();
  if (prev.bankrupt) return;
  if (rankedRunExhausted()) {
    useSettingsStore.getState().setPaused(true);
    gameEvents.emit({ type: 'runEnded' });
    return;
  }

  const step = stepSession(prev);
  commit(step.state, prev);
  if (step.news) gameEvents.emit({ type: 'news', news: step.news });

  const closed: ClosedTrade[] = [];
  for (const e of step.events) {
    if (e.type === 'orderFilled') gameEvents.emit({ type: 'orderFilled', position: e.position });
    else {
      closed.push(e.trade);
      gameEvents.emit({ type: 'positionClosed', trade: e.trade });
    }
  }
  onTradesClosed(closed);
  if (step.events.length > 0 || step.candleClosed) {
    checkAchievements(step.state.account, pricesOf(step.state.market));
  }
  if (step.becameBankrupt) declareBankruptcy(step.state.account);
}

/* ---------------------------------------------------------------- actions */

export function submitOrder(request: OrderRequest): Result<Position | PendingOrder> {
  const prev = currentSession();
  const action: GameAction = { tick: prev.market.tick, type: 'placeOrder', payload: request };
  const { state, result } = applyAction(prev, action);
  if (!result.ok) return result;
  commit(state, prev);
  record(action);
  const outcome = result.value;
  if (outcome.kind === 'position') {
    gameEvents.emit({ type: 'positionOpened', position: outcome.position });
    checkAchievements(state.account, pricesOf(state.market));
    return { ok: true, value: outcome.position };
  }
  if (outcome.kind === 'order') {
    gameEvents.emit({ type: 'orderPlaced', order: outcome.order });
    return { ok: true, value: outcome.order };
  }
  return { ok: false, error: 'marketClosed' };
}

export function closePositionById(positionId: string): Result<ClosedTrade> {
  const prev = currentSession();
  const action: GameAction = {
    tick: prev.market.tick,
    type: 'closePosition',
    payload: { positionId },
  };
  const { state, result } = applyAction(prev, action);
  if (!result.ok) return result;
  if (result.value.kind !== 'closed') return { ok: false, error: 'positionNotFound' };
  commit(state, prev);
  record(action);
  gameEvents.emit({ type: 'positionClosed', trade: result.value.trade });
  onTradesClosed([result.value.trade]);
  checkAchievements(state.account, pricesOf(state.market));
  if (state.bankrupt) declareBankruptcy(state.account);
  return { ok: true, value: result.value.trade };
}

export function cancelOrderById(orderId: string): Result<PendingOrder> {
  const prev = currentSession();
  const action: GameAction = { tick: prev.market.tick, type: 'cancelOrder', payload: { orderId } };
  const { state, result } = applyAction(prev, action);
  if (!result.ok) return result;
  if (result.value.kind !== 'cancelled') return { ok: false, error: 'orderNotFound' };
  commit(state, prev);
  record(action);
  gameEvents.emit({ type: 'orderCancelled', order: result.value.order });
  return { ok: true, value: result.value.order };
}

/** Pause/resume is logged as well (a no-op for the simulation, kept for analysis). */
export function togglePause(): void {
  const settings = useSettingsStore.getState();
  const paused = !settings.paused;
  settings.setPaused(paused);
  record({ tick: useMarketStore.getState().tick, type: paused ? 'pause' : 'resume' });
}

/* --------------------------------------------------------------- sessions */

function loadSession(session: SessionState): void {
  useMarketStore.getState().setSnapshot(session.market);
  usePortfolioStore.setState({
    account: session.account,
    equityHistory: session.equityHistory,
    maxLeverageUsed: session.maxLeverageUsed,
    maxOpenPositions: session.maxOpenPositions,
    bankrupt: session.bankrupt,
  });
  useSettingsStore.getState().setPaused(false);
}

/** Starts a fresh session from a server-issued ranked run config. */
export function startRankedSession(
  config: Pick<RunConfig, 'seed' | 'startTime' | 'startingBalance'>,
): void {
  loadSession(createSession(config));
}

/** Ends the current local session (recording it on the device) and starts a new guest one. */
export function restartGame(seed?: number): void {
  const portfolio = usePortfolioStore.getState();
  if (!portfolio.bankrupt) recordLocalSession(portfolio.account, false);
  useMarketStore.getState().reset(seed);
  usePortfolioStore.setState(initialPortfolio());
  useSettingsStore.getState().setPaused(false);
}

export function currentEquity(): number {
  const s = currentSession();
  return Math.max(0, summarizeAccount(s.account, pricesOf(s.market)).equity);
}
