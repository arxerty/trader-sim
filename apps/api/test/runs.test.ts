import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ENGINE_VERSION, RUN_START_TICK } from '@trader-sim/engine';
import type { RunConfigDto } from '@trader-sim/shared';
import {
  createTestApp,
  registerUser,
  resetDb,
  type RegisteredUser,
  type TestContext,
} from './helpers';
import { playHonestly } from './play';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await resetDb(ctx.prisma);
  ctx.clock.reset();
});

const http = () => request(ctx.app.server);
const auth = (u: RegisteredUser) => ({ authorization: `Bearer ${u.token}` });

async function startRun(
  user: RegisteredUser,
  mode: 'standard' | 'daily' = 'standard',
): Promise<RunConfigDto> {
  const res = await http().post('/runs').set(auth(user)).send({ mode });
  expect(res.status).toBe(201);
  return res.body as RunConfigDto;
}

describe('run lifecycle', () => {
  it('issues a server seed and allows only one active run per user', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    expect(config).toMatchObject({
      startTick: RUN_START_TICK,
      engineVersion: ENGINE_VERSION,
      startingBalance: 10_000,
    });
    const second = await http().post('/runs').set(auth(user)).send({});
    expect(second.status).toBe(409);
    expect(second.body.error).toMatchObject({
      code: 'RUN_ALREADY_ACTIVE',
      details: { runId: config.runId },
    });

    const active = await http().get('/runs/active').set(auth(user));
    expect(active.body.run.runId).toBe(config.runId);
    await http().post(`/runs/${config.runId}/abandon`).set(auth(user)).send({});
    expect((await http().get('/runs/active').set(auth(user))).body.run).toBeNull();
  });

  it('protects runs from other users (IDOR → 404)', async () => {
    const owner = await registerUser(ctx);
    const intruder = await registerUser(ctx);
    const config = await startRun(owner);
    const paths = [
      ['get', `/runs/${config.runId}`],
      ['post', `/runs/${config.runId}/actions`],
      ['post', `/runs/${config.runId}/finish`],
      ['post', `/runs/${config.runId}/abandon`],
    ] as const;
    for (const [method, path] of paths) {
      const body = path.endsWith('actions')
        ? { actions: [], clientTick: RUN_START_TICK }
        : path.endsWith('finish')
          ? {
              finalTick: RUN_START_TICK,
              engineVersion: ENGINE_VERSION,
              clientSummary: { finalEquity: 1 },
            }
          : {};
      const res = await http()[method](path).set(auth(intruder)).send(body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.body.error.code).toBe('RUN_NOT_FOUND');
    }
    expect((await http().get(`/runs/${config.runId}`)).status).toBe(401);
  });
});

describe('anti-cheat replay', () => {
  it('accepts an honest run: server recomputes the result and ranks it', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    const play = playHonestly(config, 220);
    ctx.clock.advance(120_000);

    const half = Math.floor(play.log.length / 2);
    const checkpoint = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({
        actions: play.log.slice(0, half),
        clientTick: play.log[half - 1]?.tick ?? RUN_START_TICK,
      });
    expect(checkpoint.status).toBe(200);
    expect(checkpoint.body.accepted).toBe(half);

    const finish = await http()
      .post(`/runs/${config.runId}/finish`)
      .set(auth(user))
      .send({
        finalTick: play.finalTick,
        engineVersion: ENGINE_VERSION,
        actions: play.log.slice(half),
        clientSummary: { finalEquity: play.finalEquity },
      });
    expect(finish.status).toBe(200);
    expect(finish.body).toMatchObject({ status: 'finished', ranked: true, flags: [] });
    expect(finish.body.summary.finalEquity).toBeCloseTo(play.finalEquity, 6);
    expect(finish.body.summary.totalTrades).toBe(play.state.account.trades.length);
    expect(finish.body.xpGained).toBeGreaterThan(0);

    const board = await http().get('/leaderboards/equity?period=all');
    expect(board.body.items[0]).toMatchObject({ nickname: user.nickname, rank: 1 });
  });

  it('ignores the client-reported result and flags a mismatch', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    const play = playHonestly(config, 150);
    ctx.clock.advance(120_000);
    const res = await http()
      .post(`/runs/${config.runId}/finish`)
      .set(auth(user))
      .send({
        finalTick: play.finalTick,
        engineVersion: ENGINE_VERSION,
        actions: play.log,
        clientSummary: { finalEquity: 1_000_000 },
      });
    expect(res.body.status).toBe('flagged');
    expect(res.body.ranked).toBe(false);
    expect(res.body.flags).toContain('CLIENT_MISMATCH');
    expect(res.body.summary.finalEquity).toBeCloseTo(play.finalEquity, 6);
    expect((await http().get('/leaderboards/equity')).body.items).toEqual([]);
  });

  it('flags a forged action log (impossible actions are rejected by the replay)', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    ctx.clock.advance(60_000);
    const t = RUN_START_TICK;
    const forged = [
      {
        tick: t + 1,
        type: 'placeOrder',
        payload: { assetId: 'BTCX', side: 'long', type: 'market', margin: 9_000_000, leverage: 10 },
      },
      { tick: t + 2, type: 'closePosition', payload: { positionId: 'p-1' } },
    ];
    const res = await http()
      .post(`/runs/${config.runId}/finish`)
      .set(auth(user))
      .send({
        finalTick: t + 50,
        engineVersion: ENGINE_VERSION,
        actions: forged,
        clientSummary: { finalEquity: 10_000 },
      });
    expect(res.body.status).toBe('flagged');
    expect(res.body.flags).toContain('REJECTED_ACTIONS');
  });

  it('rejects ticks going backwards and malformed actions', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    ctx.clock.advance(60_000);
    const t = RUN_START_TICK;
    const backwards = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({
        actions: [
          { tick: t + 10, type: 'pause' },
          { tick: t + 5, type: 'resume' },
        ],
        clientTick: t + 10,
      });
    expect(backwards.status).toBe(422);
    expect(backwards.body.error.code).toBe('ACTIONS_INVALID');

    const unknownType = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({ actions: [{ tick: t + 1, type: 'printMoney' }], clientTick: t + 1 });
    expect(unknownType.status).toBe(400);
    expect(unknownType.body.error.code).toBe('VALIDATION_ERROR');

    const flood = Array.from({ length: 6 }, () => ({ tick: t + 3, type: 'pause' as const }));
    const tooMany = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({ actions: flood, clientTick: t + 3 });
    expect(tooMany.body.error.code).toBe('ACTIONS_LIMIT');
  });

  it('rejects a game that advanced faster than 5× real time', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    ctx.clock.advance(10_000); // 10 s → at most 50 ticks (+ slack)
    const res = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({ actions: [], clientTick: RUN_START_TICK + 500 });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('ACTIONS_TOO_FAST');
  });

  it('does not rank runs played on a different engine version', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    const play = playHonestly(config, 100);
    ctx.clock.advance(60_000);
    const res = await http()
      .post(`/runs/${config.runId}/finish`)
      .set(auth(user))
      .send({
        finalTick: play.finalTick,
        engineVersion: '0.0.1-old',
        actions: play.log,
        clientSummary: { finalEquity: play.finalEquity },
      });
    expect(res.body).toMatchObject({ status: 'finished', ranked: false });
    expect(res.body.flags).toEqual(['ENGINE_VERSION_MISMATCH']);
  });

  it('expires unfinished runs after their TTL', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    ctx.clock.advance(25 * 3600_000);
    const res = await http()
      .post(`/runs/${config.runId}/actions`)
      .set(auth(user))
      .send({ actions: [], clientTick: RUN_START_TICK });
    expect(res.body.error.code).toBe('RUN_EXPIRED');
    expect((await http().post('/runs').set(auth(user)).send({})).status).toBe(201);
  });

  it('moderators can approve a flagged run after review', async () => {
    const user = await registerUser(ctx);
    const config = await startRun(user);
    const play = playHonestly(config, 120);
    ctx.clock.advance(60_000);
    const flagged = await http()
      .post(`/runs/${config.runId}/finish`)
      .set(auth(user))
      .send({
        finalTick: play.finalTick,
        engineVersion: ENGINE_VERSION,
        actions: play.log,
        clientSummary: { finalEquity: 1 },
      });
    expect(flagged.body.status).toBe('flagged');
    expect((await http().post(`/admin/runs/${config.runId}/approve`)).status).toBe(403);
    const approved = await http()
      .post(`/admin/runs/${config.runId}/approve`)
      .set('x-admin-token', 'admin-test-token');
    expect(approved.body).toMatchObject({ status: 'finished', ranked: true });
  });
});

describe('daily challenge', () => {
  it('gives everyone the same seed and allows one counted attempt per day', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    const ca = await startRun(a, 'daily');
    const cb = await startRun(b, 'daily');
    expect(ca.seed).toBe(cb.seed);
    expect(ca.startTime).toBe(cb.startTime);
    expect(ca.dailyDate).toBe('2026-10-14');

    const play = playHonestly(ca, 120);
    ctx.clock.advance(60_000);
    await http()
      .post(`/runs/${ca.runId}/finish`)
      .set(auth(a))
      .send({
        finalTick: play.finalTick,
        engineVersion: ENGINE_VERSION,
        actions: play.log,
        clientSummary: { finalEquity: play.finalEquity },
      });
    const again = await http().post('/runs').set(auth(a)).send({ mode: 'daily' });
    expect(again.body.error.code).toBe('DAILY_ALREADY_PLAYED');

    const daily = await http().get('/daily').set(auth(a));
    expect(daily.body).toMatchObject({ date: '2026-10-14', played: true, participants: 2 });
    expect(daily.body.result.rank).toBe(1);
    const board = await http().get('/leaderboards/equity?period=daily');
    expect(board.body.items).toHaveLength(1);
  });
});
