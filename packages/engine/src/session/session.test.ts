import { describe, expect, it } from 'vitest';
import type { GameAction, RunConfig } from '../types';
import { applyAction, createSession, ENGINE_VERSION, riskScore, stepSession } from './session';
import { replayRun, RUN_START_TICK } from './replay';

const config: RunConfig = {
  seed: 4242,
  startTime: Date.UTC(2026, 0, 1),
  startingBalance: 10_000,
  maxTicks: 600,
  engineVersion: ENGINE_VERSION,
};

/** Plays a scripted session the way the web client does and records its action log. */
function playLikeClient(ticks: number) {
  let state = createSession(config);
  const log: GameAction[] = [];
  const act = (action: GameAction) => {
    const applied = applyAction(state, action);
    if (applied.result.ok) {
      state = applied.state;
      log.push(action);
    }
    return applied.result;
  };
  for (let i = 0; i < ticks; i++) {
    const tick = state.market.tick;
    if (i === 3)
      act({
        tick,
        type: 'placeOrder',
        payload: { assetId: 'BTCX', side: 'long', type: 'market', margin: 2000, leverage: 5 },
      });
    if (i === 10)
      act({
        tick,
        type: 'placeOrder',
        payload: { assetId: 'NOVA', side: 'short', type: 'market', margin: 1500, leverage: 2 },
      });
    if (i === 20) act({ tick, type: 'pause' });
    if (i === 40) {
      const first = state.account.positions[0];
      if (first) act({ tick, type: 'closePosition', payload: { positionId: first.id } });
    }
    if (i === 60)
      act({
        tick,
        type: 'placeOrder',
        payload: {
          assetId: 'AURM',
          side: 'long',
          type: 'limit',
          margin: 500,
          leverage: 1,
          limitPrice: 1,
        },
      });
    if (i === 70) {
      const order = state.account.orders[0];
      if (order) act({ tick, type: 'cancelOrder', payload: { orderId: order.id } });
    }
    state = stepSession(state).state;
  }
  return { state, log };
}

describe('session determinism', () => {
  it('starts at the documented tick', () => {
    expect(createSession(config).market.tick).toBe(RUN_START_TICK);
  });

  it('replay of a client log reproduces the exact final state', () => {
    const { state, log } = playLikeClient(200);
    const replay = replayRun(config, log, state.market.tick);
    expect(replay.rejected).toEqual([]);
    expect(replay.state).toEqual(state);
    expect(replay.summary.totalTrades).toBe(state.account.trades.length);
  });

  it('same seed + same log = same result, every time', () => {
    const { state, log } = playLikeClient(150);
    const a = replayRun(config, log, state.market.tick);
    const b = replayRun(config, JSON.parse(JSON.stringify(log)) as GameAction[], state.market.tick);
    expect(a.summary).toEqual(b.summary);
  });

  it('a different seed gives a different result for the same log', () => {
    const { state, log } = playLikeClient(150);
    const other = replayRun({ ...config, seed: 1 }, log, state.market.tick);
    expect(other.summary.finalEquity).not.toBe(
      replayRun(config, log, state.market.tick).summary.finalEquity,
    );
  });

  it('rejects non-monotonic ticks and impossible actions', () => {
    const t = RUN_START_TICK;
    const log: GameAction[] = [
      {
        tick: t + 5,
        type: 'placeOrder',
        payload: { assetId: 'NOVA', side: 'long', type: 'market', margin: 100, leverage: 1 },
      },
      { tick: t + 2, type: 'pause' },
      { tick: t + 6, type: 'closePosition', payload: { positionId: 'p-999' } },
      {
        tick: t + 7,
        type: 'placeOrder',
        payload: { assetId: 'NOVA', side: 'long', type: 'market', margin: 1e9, leverage: 1 },
      },
      { tick: t + 9999, type: 'pause' },
    ];
    const reasons = replayRun(config, log, t + 50).rejected.map((r) => r.reason);
    expect(reasons).toEqual([
      'nonMonotonicTick',
      'positionNotFound',
      'insufficientFunds',
      'tickOutOfRange',
    ]);
  });

  it('caps the run at maxTicks', () => {
    const r = replayRun(config, [], RUN_START_TICK + 10_000);
    expect(r.finalTick).toBe(RUN_START_TICK + config.maxTicks);
    expect(r.summary.ticks).toBe(config.maxTicks);
  });

  it('a forged log cannot claim a profit the market did not give', () => {
    const honest = playLikeClient(120);
    const forged: GameAction[] = honest.log.map((a) =>
      a.type === 'placeOrder' ? { ...a, payload: { ...a.payload, leverage: 10 as const } } : a,
    );
    const replay = replayRun(config, forged, honest.state.market.tick);
    expect(replay.summary.finalEquity).not.toBeCloseTo(
      replayRun(config, honest.log, honest.state.market.tick).summary.finalEquity,
      2,
    );
  });
});

describe('riskScore', () => {
  it('is zero for flat or short curves and positive for steady growth', () => {
    expect(riskScore([])).toBe(0);
    expect(riskScore([100, 100, 100])).toBe(0);
    expect(riskScore([100, 101, 102.5, 103, 104.2])).toBeGreaterThan(0);
    expect(riskScore([100, 99, 97, 96, 94])).toBeLessThan(0);
  });
});
