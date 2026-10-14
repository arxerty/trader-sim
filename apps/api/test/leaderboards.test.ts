import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ENGINE_VERSION } from '@trader-sim/engine';
import type { LeaderboardRow, RunConfigDto } from '@trader-sim/shared';
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

async function playRun(user: RegisteredUser, style: number, ticks = 150) {
  const config = (await http().post('/runs').set(auth(user)).send({})).body as RunConfigDto;
  const play = playHonestly(config, ticks, style);
  ctx.clock.advance(120_000);
  const res = await http()
    .post(`/runs/${config.runId}/finish`)
    .set(auth(user))
    .send({
      finalTick: play.finalTick,
      engineVersion: ENGINE_VERSION,
      actions: play.log,
      clientSummary: { finalEquity: play.finalEquity },
    });
  expect(res.body.status).toBe('finished');
  return res.body.summary.finalEquity as number;
}

async function seedPlayers(n: number) {
  const players: Array<RegisteredUser & { equity: number }> = [];
  for (let i = 0; i < n; i++) {
    const user = await registerUser(ctx, `Ranked_${i}`);
    players.push({ ...user, equity: await playRun(user, i, 100 + i * 20) });
  }
  return players;
}

describe('leaderboards', () => {
  it('orders by value and paginates with a stable cursor', async () => {
    const players = await seedPlayers(5);
    const expected = [...players].sort((a, b) => b.equity - a.equity).map((p) => p.nickname);

    const seen: LeaderboardRow[] = [];
    let cursor: string | null = null;
    do {
      const query: Record<string, string> = { period: 'all', limit: '2' };
      if (cursor) query.cursor = cursor;
      const res = await http().get('/leaderboards/equity').query(query);
      expect(res.status).toBe(200);
      expect(res.body.items.length).toBeLessThanOrEqual(2);
      seen.push(...res.body.items);
      cursor = res.body.nextCursor;
    } while (cursor);

    expect(seen.map((r) => r.nickname)).toEqual(expected);
    expect(seen.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    for (let i = 1; i < seen.length; i++)
      expect(seen[i - 1]!.value).toBeGreaterThanOrEqual(seen[i]!.value);
  });

  it('returns my position with neighbours above and below', async () => {
    const players = await seedPlayers(5);
    const sorted = [...players].sort((a, b) => b.equity - a.equity);
    const middle = sorted[2]!;
    const res = await http().get('/leaderboards/equity/me').set(auth(middle));
    expect(res.body.me).toMatchObject({ rank: 3, nickname: middle.nickname });
    expect(res.body.above.map((r: LeaderboardRow) => r.nickname)).toEqual([
      sorted[0]!.nickname,
      sorted[1]!.nickname,
    ]);
    expect(res.body.above.map((r: LeaderboardRow) => r.rank)).toEqual([1, 2]);
    expect(res.body.below.map((r: LeaderboardRow) => r.rank)).toEqual([4, 5]);
  });

  it('keeps only the best value per player', async () => {
    const user = await registerUser(ctx, 'Repeat_1');
    const results = [await playRun(user, 1, 120), await playRun(user, 3, 200)];
    const res = await http().get('/leaderboards/equity');
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].value).toBeCloseTo(Math.max(...results), 6);
  });

  it('hides private players and supports week / season / friends boards', async () => {
    const players = await seedPlayers(3);
    const [a, b, c] = players as [(typeof players)[0], (typeof players)[0], (typeof players)[0]];
    await http().patch('/me/privacy').set(auth(c)).send({ hideFromLeaderboard: true });
    const all = await http().get('/leaderboards/equity');
    expect(all.body.items.map((r: LeaderboardRow) => r.nickname)).not.toContain(c.nickname);
    expect((await http().get('/leaderboards/equity/me').set(auth(c))).body.me).toBeNull();
    expect((await http().get(`/users/${c.nickname}`)).status).toBe(404);

    const week = await http().get('/leaderboards/roi?period=week');
    expect(week.body.periodKey).toBe('2026-W42');
    expect(week.body.items).toHaveLength(2);
    const season = await http().get('/leaderboards/equity?period=season');
    expect(season.body.periodKey).toBe('2026-10');
    expect((await http().get('/seasons')).body.seasons[0].key).toBe('2026-10');

    expect((await http().get('/leaderboards/equity?period=friends')).status).toBe(401);
    await http().post('/friends/requests').set(auth(a)).send({ nickname: b.nickname });
    const requests = await http().get('/friends/requests').set(auth(b));
    await http()
      .post(`/friends/requests/${requests.body.requests[0].id}/accept`)
      .set(auth(b))
      .send({});
    const friends = await http().get('/leaderboards/equity?period=friends').set(auth(a));
    expect(friends.body.items.map((r: LeaderboardRow) => r.nickname).sort()).toEqual(
      [a.nickname, b.nickname].sort(),
    );
  });

  it('validates the board type and query', async () => {
    expect((await http().get('/leaderboards/luck')).body.error.code).toBe('VALIDATION_ERROR');
    expect((await http().get('/leaderboards/equity?limit=1000')).status).toBe(400);
    expect((await http().get('/leaderboards/equity?cursor=garbage')).body.error.code).toBe(
      'VALIDATION_ERROR',
    );
  });
});

describe('profiles, friends, sync, GDPR', () => {
  it('shows a public profile with verified stats', async () => {
    const [p] = await seedPlayers(1);
    const res = await http().get(`/users/${p!.nickname.toLowerCase()}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nickname: p!.nickname, stats: { runs: 1 } });
    expect(res.body.bestRuns).toHaveLength(1);
    expect((await http().get('/users/Nobody_here')).body.error.code).toBe('USER_NOT_FOUND');
  });

  it('runs the friend request workflow', async () => {
    const a = await registerUser(ctx);
    const b = await registerUser(ctx);
    expect(
      (await http().post('/friends/requests').set(auth(a)).send({ nickname: a.nickname })).body
        .error.code,
    ).toBe('CANNOT_FRIEND_SELF');
    expect(
      (await http().post('/friends/requests').set(auth(a)).send({ nickname: b.nickname })).status,
    ).toBe(201);
    expect(
      (await http().post('/friends/requests').set(auth(a)).send({ nickname: b.nickname })).body
        .error.code,
    ).toBe('FRIEND_REQUEST_EXISTS');
    // b sends back → auto-accept
    await http().post('/friends/requests').set(auth(b)).send({ nickname: a.nickname });
    expect(
      (await http().get('/friends').set(auth(a))).body.friends.map(
        (f: { nickname: string }) => f.nickname,
      ),
    ).toEqual([b.nickname]);
    await http().delete(`/friends/${b.nickname}`).set(auth(a));
    expect((await http().get('/friends').set(auth(b))).body.friends).toEqual([]);
  });

  it('syncs settings with optimistic concurrency', async () => {
    const u = await registerUser(ctx);
    const initial = await http().get('/me/settings').set(auth(u));
    expect(initial.body.version).toBe(0);
    const settings = { locale: 'ru', theme: 'dark', soundEnabled: false, volume: 0.3, speed: 2 };
    const saved = await http().put('/me/settings').set(auth(u)).send({ settings, baseVersion: 0 });
    expect(saved.body.version).toBe(1);
    const stale = await http()
      .put('/me/settings')
      .set(auth(u))
      .send({ settings: { ...settings, theme: 'light' }, baseVersion: 0 });
    expect(stale.status).toBe(409);
    expect(stale.body.error).toMatchObject({
      code: 'VERSION_CONFLICT',
      details: { version: 1, settings: { theme: 'dark' } },
    });
    expect((await http().get('/me').set(auth(u))).body.locale).toBe('ru');
  });

  it('exports and deletes the account', async () => {
    const [p] = await seedPlayers(1);
    const exported = await http().get('/me/export').set(auth(p!));
    expect(exported.status).toBe(200);
    expect(exported.body.user.nickname).toBe(p!.nickname);
    expect(exported.body.user.runs[0].actions.length).toBeGreaterThan(0);
    expect(JSON.stringify(exported.body)).not.toContain('passwordHash');

    expect(
      (await http().delete('/me').set(auth(p!)).send({ password: 'wrong-password' })).status,
    ).toBe(403);
    expect(
      (await http().delete('/me').set(auth(p!)).send({ password: 'correct-horse-1' })).body.deleted,
    ).toBe(true);
    expect(await ctx.prisma.run.count()).toBe(0);
    expect((await http().get('/leaderboards/equity')).body.items).toEqual([]);
  });
});

describe('platform', () => {
  it('serves health, OpenAPI and a uniform error format', async () => {
    const health = await http().get('/health');
    expect(health.body).toMatchObject({
      status: 'ok',
      db: 'up',
      redis: 'disabled',
      engineVersion: ENGINE_VERSION,
    });
    const docs = await http().get('/docs/json');
    expect(docs.status).toBe(200);
    expect(Object.keys(docs.body.paths)).toEqual(
      expect.arrayContaining(['/runs/{id}/finish', '/leaderboards/{type}/me']),
    );
    const missing = await http().get('/nope');
    expect(missing.body).toEqual({ error: { code: 'NOT_FOUND', message: expect.any(String) } });
  });

  it('applies the CORS allow-list and security headers', async () => {
    const allowed = await http().get('/health').set('origin', 'http://localhost:5173');
    expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
    const denied = await http().get('/health').set('origin', 'https://evil.example');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });
});
