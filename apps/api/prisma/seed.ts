/**
 * Demo data: achievement catalogue, demo players with honest (engine-replayed)
 * runs, leaderboards, friendships and today's daily challenge.
 * Usage: npm run db:seed   (demo password for every player: demo-password-123)
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  ACHIEVEMENTS,
  applyAction,
  ASSETS,
  createSession,
  ENGINE_VERSION,
  replayRun,
  RUN_START_TICK,
  stepSession,
  type GameAction,
  type Leverage,
  type SessionState,
} from '@trader-sim/engine';
import { dayKey, RUN_MAX_TICKS, STARTING_CAPITAL, startOfUtcDay } from '@trader-sim/shared';
import { buildApp } from '../src/app';
import { loadConfig } from '../src/config';
import { loadDotEnv } from '../src/env';
import { hashPassword } from '../src/lib/crypto';
import { dailySeed, RunService } from '../src/modules/runs/service';

const DEMO_PLAYERS = [
  'NovaHunter',
  'GoldBug',
  'CryptoKit',
  'BearSlayer',
  'IndexIvy',
  'VoltRider',
  'PharmaPhil',
  'WheatWolf',
  'TapeReader',
  'CandleQueen',
  'RiskyRick',
  'CalmCarla',
];
const DEMO_PASSWORD = 'demo-password-123';

/** A simple deterministic "bot": opens a position, holds it for a while, closes it. */
function playBot(
  seed: number,
  startTime: number,
  style: number,
  ticks: number,
): { log: GameAction[]; finalTick: number } {
  let state: SessionState = createSession({ seed, startTime, startingBalance: STARTING_CAPITAL });
  const log: GameAction[] = [];
  const leverages: Leverage[] = [1, 2, 5, 10];
  const act = (action: GameAction) => {
    const res = applyAction(state, action);
    if (res.result.ok) {
      state = res.state;
      log.push(action);
    }
  };
  for (let i = 0; i < ticks && !state.bankrupt; i++) {
    const tick = state.market.tick;
    if (i % 40 === 5) {
      const round = Math.floor(i / 40) + style;
      const asset = ASSETS[round % ASSETS.length]!;
      act({
        tick,
        type: 'placeOrder',
        payload: {
          assetId: asset.id,
          side: round % 3 === 0 ? 'short' : 'long',
          type: 'market',
          margin: 800 + style * 150,
          leverage: leverages[style % leverages.length]!,
        },
      });
    }
    if (i % 40 === 30) {
      const open = state.account.positions[0];
      if (open) act({ tick, type: 'closePosition', payload: { positionId: open.id } });
    }
    state = stepSession(state).state;
  }
  return { log, finalTick: state.market.tick };
}

async function main() {
  loadDotEnv();
  const config = loadConfig(process.env, { LOG_LEVEL: 'warn', SWAGGER_ENABLED: 'false' });
  const prisma = new PrismaClient();
  const app = await buildApp({ config, prisma, logger: false });
  const runs = new RunService(app);

  for (const a of ACHIEVEMENTS) {
    await prisma.achievement.upsert({
      where: { id: a.id },
      create: { id: a.id, xp: a.xp, icon: a.icon },
      update: { xp: a.xp, icon: a.icon },
    });
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();
  const today = dayKey(now);
  const daily = await prisma.dailyChallenge.upsert({
    where: { date: today },
    create: { date: today, seed: dailySeed(config.DAILY_SEED_SECRET, today) },
    update: {},
  });

  const users = [];
  for (const [index, nickname] of DEMO_PLAYERS.entries()) {
    const email = `${nickname.toLowerCase()}@demo.tradesim.local`;
    if (await prisma.user.findUnique({ where: { email } })) {
      console.log(`skip ${nickname} (exists)`);
      continue;
    }
    const user = await prisma.user.create({
      data: {
        email,
        emailVerified: true,
        passwordHash,
        nickname,
        nicknameLower: nickname.toLowerCase(),
        profile: { create: {} },
      },
    });
    users.push(user);

    const runCount = 2 + (index % 3);
    for (let r = 0; r < runCount; r++) {
      const daysAgo = (index * 3 + r * 5) % 40;
      const finishedAt = new Date(now.getTime() - daysAgo * 86_400_000);
      const startTime = finishedAt.getTime() - 3600_000;
      const isDaily = r === 0 && index % 2 === 0;
      const seed = isDaily ? daily.seed : 1000 + index * 17 + r;
      const runStart = isDaily ? startOfUtcDay(now).getTime() : startTime;
      const { log, finalTick } = playBot(
        seed,
        runStart,
        index + r,
        300 + ((index * 37 + r * 53) % 500),
      );

      const runData: Prisma.RunUncheckedCreateInput = {
        userId: user.id,
        mode: isDaily ? 'DAILY' : 'STANDARD',
        dailyDate: isDaily ? today : null,
        status: 'FINISHED',
        seed,
        startTime: BigInt(runStart),
        startingBalance: STARTING_CAPITAL,
        maxTicks: RUN_MAX_TICKS,
        engineVersion: ENGINE_VERSION,
        clientEngine: ENGINE_VERSION,
        lastTick: finalTick,
        actionCount: log.length,
        startedAt: new Date(startTime),
        finishedAt: isDaily ? now : finishedAt,
        expiresAt: new Date(startTime + 86_400_000),
      };
      const run = await prisma.run.create({ data: runData });
      await prisma.runAction.createMany({
        data: log.map((a, seq) => ({
          runId: run.id,
          seq,
          tick: a.tick,
          type: a.type,
          payload: 'payload' in a ? (a.payload as Prisma.InputJsonValue) : undefined,
        })),
      });
      // Results are always computed by replay, exactly like for real players.
      const replay = replayRun(
        {
          seed,
          startTime: runStart,
          startingBalance: STARTING_CAPITAL,
          maxTicks: RUN_MAX_TICKS,
          engineVersion: ENGINE_VERSION,
        },
        log,
        finalTick,
      );
      const s = replay.summary;
      const stored = await prisma.run.update({
        where: { id: run.id },
        data: {
          finalEquity: s.finalEquity,
          roi: s.roi,
          bestTrade: s.bestTrade,
          longestStreak: s.longestWinStreak,
          maxDrawdown: s.maxDrawdown,
          riskScore: s.riskScore,
          totalTrades: s.totalTrades,
          winRate: s.winRate,
          ticks: s.ticks,
          bankrupt: s.bankrupt,
          achievements: s.achievements,
          clientEquity: s.finalEquity,
        },
      });
      await runs.applyVerifiedRun(stored, s, replay.state.account.trades);
    }
    console.log(`seeded ${nickname} (${runCount} runs, start tick ${RUN_START_TICK})`);
  }

  // A small friend graph so the "friends" leaderboard has data.
  for (let i = 0; i + 1 < users.length; i += 2) {
    const a = users[i]!;
    const b = users[i + 1]!;
    await prisma.friendship.create({
      data: { requesterId: a.id, addresseeId: b.id, status: 'ACCEPTED', respondedAt: now },
    });
  }

  await app.close();
  await prisma.$disconnect();
  console.log(`done. Demo login: <nickname>@demo.tradesim.local / ${DEMO_PASSWORD}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
