import { beforeEach, describe, expect, it } from 'vitest';
import {
  closePositionById,
  cancelOrderById,
  gameEvents,
  restartGame,
  runTick,
  submitOrder,
  type GameEvent,
} from './game';
import { useMarketStore } from './marketStore';
import { usePortfolioStore } from './portfolioStore';
import { useProgressStore } from './progressStore';

const request = {
  assetId: 'NOVA',
  side: 'long',
  type: 'market',
  margin: 1000,
  leverage: 2,
} as const;

beforeEach(() => {
  useMarketStore.getState().reset(123);
  usePortfolioStore.getState().reset();
  useProgressStore.getState().resetProgress();
});

describe('game orchestration', () => {
  it('opens a position and emits an event', () => {
    const events: GameEvent[] = [];
    const unsubscribe = gameEvents.subscribe((e) => events.push(e));
    const result = submitOrder(request);
    unsubscribe();
    expect(result.ok).toBe(true);
    expect(usePortfolioStore.getState().account.positions).toHaveLength(1);
    expect(usePortfolioStore.getState().maxLeverageUsed).toBe(2);
    expect(events.map((e) => e.type)).toContain('positionOpened');
  });

  it('closing a non-existent position is a handled error', () => {
    expect(closePositionById('ghost')).toEqual({ ok: false, error: 'positionNotFound' });
    expect(cancelOrderById('ghost')).toEqual({ ok: false, error: 'orderNotFound' });
  });

  it('closing a position records the trade, XP and achievements', () => {
    const opened = submitOrder(request);
    if (!opened.ok) throw new Error(opened.error);
    const closed = closePositionById(opened.value.id);
    expect(closed.ok).toBe(true);
    expect(usePortfolioStore.getState().account.trades).toHaveLength(1);
    const progress = useProgressStore.getState();
    expect(progress.unlocked.firstTrade).toBeDefined();
    expect(progress.xp).toBeGreaterThanOrEqual(15);
  });

  it('advances the market on each tick', () => {
    const before = useMarketStore.getState().tick;
    runTick();
    runTick();
    expect(useMarketStore.getState().tick).toBe(before + 2);
  });

  it('declares bankruptcy, records it and stops ticking', () => {
    usePortfolioStore
      .getState()
      .update({ account: { ...usePortfolioStore.getState().account, balance: 3 } });
    runTick();
    expect(usePortfolioStore.getState().bankrupt).toBe(true);
    expect(useProgressStore.getState().leaderboard[0]?.bankrupt).toBe(true);
    const tick = useMarketStore.getState().tick;
    runTick();
    expect(useMarketStore.getState().tick).toBe(tick);
    expect(submitOrder(request)).toEqual({ ok: false, error: 'marketClosed' });
  });

  it('restart resets the session but keeps progress', () => {
    const opened = submitOrder(request);
    if (opened.ok) closePositionById(opened.value.id);
    const xp = useProgressStore.getState().xp;
    restartGame(77);
    expect(usePortfolioStore.getState().account.trades).toHaveLength(0);
    expect(usePortfolioStore.getState().account.balance).toBe(10_000);
    expect(useMarketStore.getState().seed).toBe(77);
    expect(useProgressStore.getState().xp).toBe(xp);
    expect(useProgressStore.getState().leaderboard).toHaveLength(1);
  });
});
