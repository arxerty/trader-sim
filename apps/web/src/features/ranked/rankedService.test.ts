import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_VERSION, RUN_START_TICK } from '@trader-sim/engine';
import type { Me, RunConfigDto, RunResultDto } from '@trader-sim/shared';
import { useAuthStore } from '@/store/authStore';
import { useMarketStore } from '@/store/marketStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useRunStore } from '@/store/runStore';
import { closePositionById, runTick, submitOrder } from '@/store/game';
import { mockApi } from '@/test/render';
import { finishRankedRun, startRankedRun, submitPendingFinish } from './rankedService';

const config: RunConfigDto = {
  runId: 'run-1',
  mode: 'standard',
  seed: 777,
  startTime: Date.UTC(2026, 9, 14),
  startingBalance: 10_000,
  maxTicks: 3600,
  startTick: RUN_START_TICK,
  engineVersion: ENGINE_VERSION,
  assets: [],
  expiresAt: '2026-10-15T00:00:00.000Z',
  dailyDate: null,
};

const result: RunResultDto = {
  runId: 'run-1',
  mode: 'standard',
  status: 'finished',
  ranked: true,
  flags: [],
  summary: null,
  clientEquity: 10_000,
  startedAt: '',
  finishedAt: '',
  xpGained: 10,
  newAchievements: [],
};

beforeEach(() => {
  useRunStore.getState().clear();
  useRunStore.getState().setLastResult(null);
  useAuthStore.getState().setSession('token', { id: 'u1', nickname: 'Me' } as Me);
});
afterEach(() => vi.unstubAllGlobals());

describe('ranked runs on the client', () => {
  it('starts a server-seeded session and records actions with their ticks', async () => {
    mockApi({ 'POST /runs': { status: 201, body: config } });
    await startRankedRun('standard');
    expect(useMarketStore.getState().seed).toBe(777);
    expect(useMarketStore.getState().tick).toBe(RUN_START_TICK);
    expect(usePortfolioStore.getState().account.balance).toBe(10_000);

    runTick();
    const opened = submitOrder({
      assetId: 'NOVA',
      side: 'long',
      type: 'market',
      margin: 500,
      leverage: 2,
    });
    expect(opened.ok).toBe(true);
    runTick();
    if (opened.ok) closePositionById(opened.value.id);
    const queue = useRunStore.getState().queue;
    expect(queue.map((a) => [a.type, a.tick])).toEqual([
      ['placeOrder', RUN_START_TICK + 1],
      ['closePosition', RUN_START_TICK + 2],
    ]);
  });

  it('keeps the result queued while offline and submits it when back online', async () => {
    mockApi({ 'POST /runs': { status: 201, body: config } });
    await startRankedRun('standard');
    submitOrder({ assetId: 'NOVA', side: 'long', type: 'market', margin: 500, leverage: 1 });

    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.reject(new TypeError('offline'))),
    );
    expect(await finishRankedRun()).toBeNull();
    const pending = useRunStore.getState().pendingFinish;
    expect(pending).toMatchObject({ runId: 'run-1', engineVersion: ENGINE_VERSION });
    expect(useRunStore.getState().queue).toHaveLength(1);

    const { calls } = mockApi({ 'POST /runs/run-1/finish': { body: result } });
    expect(await submitPendingFinish()).toEqual(result);
    const finish = calls.find((c) => c.path === '/runs/run-1/finish');
    expect(finish?.body).toMatchObject({
      finalTick: pending?.finalTick,
      actions: [{ type: 'placeOrder' }],
    });
    expect(useRunStore.getState()).toMatchObject({
      run: null,
      queue: [],
      pendingFinish: null,
      lastResult: result,
    });
  });

  it('abandons a leftover server run when starting a new one', async () => {
    let created = 0;
    const { calls } = mockApi({
      'POST /runs': () =>
        created++ === 0
          ? {
              status: 409,
              body: {
                error: { code: 'RUN_ALREADY_ACTIVE', message: '', details: { runId: 'old' } },
              },
            }
          : { status: 201, body: config },
      'POST /runs/old/abandon': { body: result },
    });
    await startRankedRun('standard');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /runs',
      'POST /runs/old/abandon',
      'POST /runs',
    ]);
    expect(useRunStore.getState().run?.runId).toBe('run-1');
  });
});
