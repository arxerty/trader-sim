import { inject } from 'vitest';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENTS } from '@trader-sim/engine';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { MemoryMailer } from '../src/lib/mailer';
import type { App } from '../src/types';

export const TEST_NOW = new Date('2026-10-14T12:00:00Z');

export class TestClock {
  constructor(public current = new Date(TEST_NOW)) {}
  reset() {
    this.current = new Date(TEST_NOW);
  }
  now = () => new Date(this.current);
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export interface TestContext {
  app: App;
  prisma: PrismaClient;
  mailer: MemoryMailer;
  clock: TestClock;
  close: () => Promise<void>;
}

let sharedPrisma: PrismaClient | null = null;

export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestContext> {
  const databaseUrl = inject('databaseUrl');
  sharedPrisma ??= new PrismaClient({ datasourceUrl: databaseUrl });
  const config = loadConfig(
    {},
    {
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'test-secret-test-secret-test-secret-!!',
      DAILY_SEED_SECRET: 'daily-test-secret',
      ADMIN_TOKEN: 'admin-test-token',
      LOG_LEVEL: 'silent',
      SWAGGER_ENABLED: 'true',
      RATE_LIMIT_ENABLED: 'false',
      COOKIE_PATH_PREFIX: '',
      WEB_URL: 'http://web.test',
      ...overrides,
    },
  );
  const mailer = new MemoryMailer();
  const clock = new TestClock();
  const app = await buildApp({ config, prisma: sharedPrisma, mailer, clock, logger: false });
  await app.ready();
  const prisma = sharedPrisma;
  return {
    app,
    prisma,
    mailer,
    clock,
    // Prisma reconnects lazily, so disconnecting here is safe even if another app shares it.
    close: async () => {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export async function resetDb(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "RunAction","LeaderboardEntry","Run","UserAchievement","Friendship","RefreshToken","EmailToken","OAuthAccount","Profile","User","DailyChallenge","Season" CASCADE',
  );
  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      create: { id: a.id, xp: a.xp, icon: a.icon },
      update: {},
    });
  }
}

/** Extracts a cookie value from a supertest response. */
export function cookieFrom(res: request.Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const line = raw?.find((c) => c.startsWith(`${name}=`));
  return line?.slice(name.length + 1).split(';')[0];
}

export interface RegisteredUser {
  agent: request.Agent;
  token: string;
  csrf: string;
  nickname: string;
  email: string;
}

let counter = 0;
export async function registerUser(
  ctx: TestContext,
  nickname = `player_${++counter}`,
): Promise<RegisteredUser> {
  const agent = request.agent(ctx.app.server);
  const email = `${nickname.toLowerCase()}@example.test`;
  const res = await agent
    .post('/auth/register')
    .send({ email, password: 'correct-horse-1', nickname });
  if (res.status !== 201)
    throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  return {
    agent,
    token: res.body.accessToken as string,
    csrf: cookieFrom(res, 'ts_csrf') ?? '',
    nickname,
    email,
  };
}
