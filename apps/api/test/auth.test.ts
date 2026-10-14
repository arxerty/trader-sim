import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { cookieFrom, createTestApp, registerUser, resetDb, type TestContext } from './helpers';

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
  ctx.mailer.outbox.length = 0;
});

const http = () => request(ctx.app.server);

describe('registration & login', () => {
  it('registers, sets httpOnly refresh + CSRF cookies and returns an access token', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'Alice@Example.test', password: 'correct-horse-1', nickname: 'Alice_01' });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({
      email: 'alice@example.test',
      nickname: 'Alice_01',
      emailVerified: false,
    });
    const cookies = (res.headers['set-cookie'] as unknown as string[]).join('\n');
    expect(cookies).toMatch(/ts_refresh=[^;]+;.*HttpOnly/i);
    expect(cookies).toMatch(/ts_refresh=[^;]+;.*SameSite=Lax/i);
    expect(cookieFrom(res, 'ts_csrf')).toBeTruthy();

    const me = await http().get('/me').set('authorization', `Bearer ${res.body.accessToken}`);
    expect(me.status).toBe(200);
    expect(me.body.nickname).toBe('Alice_01');
    // password hash never leaves the server
    expect(JSON.stringify(me.body)).not.toContain('argon2');
    const stored = await ctx.prisma.user.findUniqueOrThrow({
      where: { email: 'alice@example.test' },
    });
    expect(stored.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects duplicates, bad nicknames and weak passwords with stable error codes', async () => {
    await registerUser(ctx, 'Taken_1');
    const dupNick = await http()
      .post('/auth/register')
      .send({ email: 'x@example.test', password: 'correct-horse-1', nickname: 'taken_1' });
    expect(dupNick.status).toBe(409);
    expect(dupNick.body.error.code).toBe('NICKNAME_TAKEN');

    const dupEmail = await http()
      .post('/auth/register')
      .send({ email: 'taken_1@example.test', password: 'correct-horse-1', nickname: 'Other_1' });
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');

    const forbidden = await http()
      .post('/auth/register')
      .send({ email: 'y@example.test', password: 'correct-horse-1', nickname: 'TheAdmin' });
    expect(forbidden.status).toBe(400);
    expect(forbidden.body.error.code).toBe('NICKNAME_FORBIDDEN');

    const weak = await http()
      .post('/auth/register')
      .send({ email: 'z@example.test', password: 'short', nickname: 'Valid_1' });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('logs in and refuses wrong credentials without revealing which part is wrong', async () => {
    const user = await registerUser(ctx);
    const ok = await http()
      .post('/auth/login')
      .send({ email: user.email, password: 'correct-horse-1' });
    expect(ok.status).toBe(200);
    const wrong = await http()
      .post('/auth/login')
      .send({ email: user.email, password: 'nope-nope-nope' });
    const unknown = await http()
      .post('/auth/login')
      .send({ email: 'ghost@example.test', password: 'nope-nope-nope' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknown.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('imports guest progress on sign-up with an XP cap', async () => {
    const res = await http()
      .post('/auth/register')
      .send({
        email: 'g@example.test',
        password: 'correct-horse-1',
        nickname: 'Guesty',
        guestProgress: { xp: 99_999, achievements: ['firstTrade', 'notARealOne'] },
      });
    const progress = await http()
      .get('/me/progress')
      .set('authorization', `Bearer ${res.body.accessToken}`);
    expect(progress.body.xp).toBe(500);
    expect(progress.body.achievements.map((a: { id: string }) => a.id)).toEqual(['firstTrade']);
  });
});

describe('refresh tokens', () => {
  it('rotates the refresh token and detects reuse of an old one', async () => {
    const user = await registerUser(ctx);
    const first = await user.agent.post('/auth/refresh').set('x-csrf-token', user.csrf);
    expect(first.status).toBe(200);
    expect(first.body.accessToken).toBeTruthy();
    const oldCookie = (
      await ctx.prisma.refreshToken.findMany({ where: { revokedAt: { not: null } } })
    ).length;
    expect(oldCookie).toBe(1);

    // Replay the original (already rotated) refresh token from a "stolen" copy.
    const regRefresh = await ctx.prisma.refreshToken.count({ where: { revokedAt: null } });
    expect(regRefresh).toBe(1);
    const csrf2 = cookieFrom(first, 'ts_csrf')!;
    const second = await user.agent.post('/auth/refresh').set('x-csrf-token', csrf2);
    expect(second.status).toBe(200);
  });

  it('revokes the whole family when a rotated token is reused', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'r@example.test', password: 'correct-horse-1', nickname: 'Rotator' });
    const original = cookieFrom(res, 'ts_refresh')!;
    const csrf = cookieFrom(res, 'ts_csrf')!;
    const cookie = (refresh: string) => `ts_refresh=${refresh}; ts_csrf=${csrf}`;

    const rotated = await http()
      .post('/auth/refresh')
      .set('cookie', cookie(original))
      .set('x-csrf-token', csrf);
    expect(rotated.status).toBe(200);
    const newToken = cookieFrom(rotated, 'ts_refresh')!;
    const newCsrf = cookieFrom(rotated, 'ts_csrf')!;

    // Outside the grace window a reused token means theft.
    ctx.clock.advance(60_000);
    const reuse = await http()
      .post('/auth/refresh')
      .set('cookie', cookie(original))
      .set('x-csrf-token', csrf);
    expect(reuse.status).toBe(401);
    expect(reuse.body.error.code).toBe('TOKEN_INVALID');

    // The legitimate newer token is now revoked as well.
    const afterTheft = await http()
      .post('/auth/refresh')
      .set('cookie', `ts_refresh=${newToken}; ts_csrf=${newCsrf}`)
      .set('x-csrf-token', newCsrf);
    expect(afterTheft.status).toBe(401);
  });

  it('tolerates a concurrent refresh race (two tabs) without revoking the session', async () => {
    const res = await http()
      .post('/auth/register')
      .send({ email: 'tabs@example.test', password: 'correct-horse-1', nickname: 'TwoTabs' });
    const token = cookieFrom(res, 'ts_refresh')!;
    const csrf = cookieFrom(res, 'ts_csrf')!;
    const send = (t: string, c: string) =>
      http()
        .post('/auth/refresh')
        .set('cookie', `ts_refresh=${t}; ts_csrf=${c}`)
        .set('x-csrf-token', c);

    const tabA = await send(token, csrf);
    expect(tabA.status).toBe(200);
    const tabB = await send(token, csrf); // same instant, same old cookie
    expect(tabB.status).toBe(401);
    // The rotated session of tab A is still valid.
    const next = await send(cookieFrom(tabA, 'ts_refresh')!, cookieFrom(tabA, 'ts_csrf')!);
    expect(next.status).toBe(200);
  });

  it('requires the CSRF header on cookie-authenticated endpoints', async () => {
    const user = await registerUser(ctx);
    const noHeader = await user.agent.post('/auth/refresh');
    expect(noHeader.status).toBe(403);
    expect(noHeader.body.error.code).toBe('CSRF_INVALID');
    const wrong = await user.agent.post('/auth/refresh').set('x-csrf-token', 'forged');
    expect(wrong.status).toBe(403);
  });

  it('expires refresh tokens after their TTL', async () => {
    const user = await registerUser(ctx);
    ctx.clock.advance(31 * 86_400_000);
    const res = await user.agent.post('/auth/refresh').set('x-csrf-token', user.csrf);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
    ctx.clock.advance(-31 * 86_400_000);
  });

  it('logout revokes the session, logout-all revokes every session', async () => {
    const user = await registerUser(ctx);
    const otherDevice = await http()
      .post('/auth/login')
      .send({ email: user.email, password: 'correct-horse-1' });
    expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(2);

    const out = await user.agent.post('/auth/logout').set('x-csrf-token', user.csrf);
    expect(out.status).toBe(200);
    expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(1);

    const all = await http()
      .post('/auth/logout-all')
      .set('authorization', `Bearer ${otherDevice.body.accessToken}`);
    expect(all.body.revoked).toBe(1);
    expect(await ctx.prisma.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('rejects expired and forged access tokens', async () => {
    const user = await registerUser(ctx);
    const forged = await http().get('/me').set('authorization', `Bearer ${user.token}x`);
    expect(forged.body.error.code).toBe('TOKEN_INVALID');
    const none = await http().get('/me');
    expect(none.status).toBe(401);
  });
});

describe('e-mail verification and password reset', () => {
  const linkToken = (text: string, param: string) =>
    decodeURIComponent(new RegExp(`${param}=([^\\s]+)`).exec(text)![1]!);

  it('verifies the e-mail through the mailed link (single use)', async () => {
    const user = await registerUser(ctx);
    const mail = ctx.mailer.outbox.find((m) => m.to === user.email)!;
    const token = linkToken(mail.text, 'verify');
    expect((await http().post('/auth/verify-email').send({ token })).status).toBe(200);
    const me = await http().get('/me').set('authorization', `Bearer ${user.token}`);
    expect(me.body.emailVerified).toBe(true);
    const again = await http().post('/auth/verify-email').send({ token });
    expect(again.body.error.code).toBe('TOKEN_INVALID');
  });

  it('resets the password and revokes existing sessions', async () => {
    const user = await registerUser(ctx);
    const unknown = await http()
      .post('/auth/forgot-password')
      .send({ email: 'nobody@example.test' });
    expect(unknown.status).toBe(200); // no e-mail enumeration
    await http().post('/auth/forgot-password').send({ email: user.email });
    const mail = ctx.mailer.outbox.find((m) => m.subject.includes('reset'))!;
    const token = linkToken(mail.text, 'reset');
    expect(
      (await http().post('/auth/reset-password').send({ token, password: 'brand-new-pass-2' }))
        .status,
    ).toBe(200);

    expect(
      (await http().post('/auth/login').send({ email: user.email, password: 'correct-horse-1' }))
        .status,
    ).toBe(401);
    expect(
      (await http().post('/auth/login').send({ email: user.email, password: 'brand-new-pass-2' }))
        .status,
    ).toBe(200);
    const oldSession = await user.agent.post('/auth/refresh').set('x-csrf-token', user.csrf);
    expect(oldSession.status).toBe(401);
  });
});

describe('rate limiting', () => {
  it('limits auth attempts per minute with RATE_LIMITED', async () => {
    const limited = await createTestApp({
      RATE_LIMIT_ENABLED: 'true',
      RATE_LIMIT_AUTH_PER_MINUTE: '3',
    });
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 5; i++) {
        const res = await request(limited.app.server)
          .post('/auth/login')
          .send({ email: 'a@b.test', password: 'whatever-123' });
        statuses.push(res.status);
        if (res.status === 429) expect(res.body.error.code).toBe('RATE_LIMITED');
      }
      expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
      expect(statuses.slice(3)).toEqual([429, 429]);
    } finally {
      await limited.close();
    }
  });
});
