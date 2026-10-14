import type { Prisma, Run } from '@prisma/client';
import {
  ACHIEVEMENTS,
  ASSETS,
  ENGINE_VERSION,
  hashSeed,
  levelForXp,
  replayRun,
  RUN_START_TICK,
  xpForTrade,
  type GameAction,
  type RunSummary,
} from '@trader-sim/engine';
import {
  dayKey,
  EQUITY_TOLERANCE,
  RUN_MAX_TICKS,
  RUN_TTL_HOURS,
  STARTING_CAPITAL,
  startOfUtcDay,
  SUSPICIOUS_ROI,
  type FinishRunBody,
  type GameActionDto,
  type RunConfigDto,
  type RunFlag,
  type RunMode,
  type RunResultDto,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { randomSeed } from '../../lib/crypto';
import { conflict, notFound } from '../../lib/errors';
import { LeaderboardService } from '../leaderboards/service';
import { validateActionBatch } from './validation';

const REVIEW_FLAGS: readonly RunFlag[] = [
  'CLIENT_MISMATCH',
  'REJECTED_ACTIONS',
  'UNREALISTIC_GROWTH',
];

const toMode = (m: Run['mode']): RunMode => (m === 'DAILY' ? 'daily' : 'standard');
const toStatus = (s: Run['status']) => s.toLowerCase() as RunResultDto['status'];

export function runConfigDto(run: Run): RunConfigDto {
  return {
    runId: run.id,
    mode: toMode(run.mode),
    seed: run.seed,
    startTime: Number(run.startTime),
    startingBalance: run.startingBalance,
    maxTicks: run.maxTicks,
    startTick: RUN_START_TICK,
    engineVersion: run.engineVersion,
    assets: ASSETS.map((a) => a.id),
    expiresAt: run.expiresAt.toISOString(),
    dailyDate: run.dailyDate,
  };
}

function summaryOf(run: Run): RunSummary | null {
  if (run.finalEquity === null) return null;
  return {
    finalEquity: run.finalEquity,
    roi: run.roi ?? 0,
    ticks: run.ticks ?? 0,
    totalTrades: run.totalTrades ?? 0,
    winRate: run.winRate ?? 0,
    bestTrade: run.bestTrade,
    longestWinStreak: run.longestStreak ?? 0,
    maxDrawdown: run.maxDrawdown ?? 0,
    riskScore: run.riskScore ?? 0,
    bankrupt: run.bankrupt ?? false,
    achievements: run.achievements as RunSummary['achievements'],
  };
}

export function runResultDto(run: Run, newAchievements: string[] = []): RunResultDto {
  return {
    runId: run.id,
    mode: toMode(run.mode),
    status: toStatus(run.status),
    ranked: run.ranked,
    flags: run.flags as RunFlag[],
    summary: summaryOf(run),
    clientEquity: run.clientEquity,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    xpGained: run.xpGained,
    newAchievements,
  };
}

export function dailySeed(secret: string, date: string): number {
  return hashSeed(`${secret}:${date}`);
}

export class RunService {
  private readonly leaderboards: LeaderboardService;

  constructor(private readonly app: App) {
    this.leaderboards = new LeaderboardService(app);
  }

  private get db() {
    return this.app.prisma;
  }

  private now() {
    return this.app.clock.now();
  }

  /** Marks the user's stale active runs as expired. */
  async expireStale(userId?: string): Promise<void> {
    await this.db.run.updateMany({
      where: { status: 'ACTIVE', expiresAt: { lte: this.now() }, ...(userId ? { userId } : {}) },
      data: { status: 'EXPIRED' },
    });
  }

  /** IDOR protection: someone else's run is indistinguishable from a missing one. */
  async getOwnRun(runId: string, userId: string): Promise<Run> {
    const run = await this.db.run.findFirst({ where: { id: runId, userId } });
    if (!run) throw notFound('RUN_NOT_FOUND', 'Run not found');
    return run;
  }

  private async getActiveOwnRun(runId: string, userId: string): Promise<Run> {
    const run = await this.getOwnRun(runId, userId);
    if (run.status === 'ACTIVE' && run.expiresAt <= this.now()) {
      await this.db.run.update({ where: { id: run.id }, data: { status: 'EXPIRED' } });
      throw conflict('RUN_EXPIRED', 'The run has expired');
    }
    if (run.status !== 'ACTIVE') throw conflict('RUN_NOT_ACTIVE', 'The run is already over');
    return run;
  }

  async create(userId: string, mode: RunMode): Promise<RunConfigDto> {
    await this.expireStale(userId);
    const active = await this.db.run.findFirst({ where: { userId, status: 'ACTIVE' } });
    if (active)
      throw conflict('RUN_ALREADY_ACTIVE', 'Finish or abandon the active run first', {
        runId: active.id,
      });

    const now = this.now();
    let data: Prisma.RunUncheckedCreateInput;
    if (mode === 'daily') {
      const date = dayKey(now);
      const played = await this.db.run.findFirst({
        where: { userId, mode: 'DAILY', dailyDate: date },
      });
      if (played)
        throw conflict('DAILY_ALREADY_PLAYED', 'Today’s challenge has already been played');
      const challenge = await this.db.dailyChallenge.upsert({
        where: { date },
        create: { date, seed: dailySeed(this.app.config.DAILY_SEED_SECRET, date) },
        update: {},
      });
      const dayStart = startOfUtcDay(now);
      data = {
        userId,
        mode: 'DAILY',
        dailyDate: date,
        seed: challenge.seed,
        // Same seed and same virtual clock for every player of the day.
        startTime: BigInt(dayStart.getTime()),
        expiresAt: new Date(dayStart.getTime() + 86_400_000),
        startingBalance: STARTING_CAPITAL,
        maxTicks: RUN_MAX_TICKS,
        engineVersion: ENGINE_VERSION,
        lastTick: RUN_START_TICK,
        startedAt: now,
      };
    } else {
      data = {
        userId,
        mode: 'STANDARD',
        seed: randomSeed(),
        startTime: BigInt(now.getTime()),
        expiresAt: new Date(now.getTime() + RUN_TTL_HOURS * 3600_000),
        startingBalance: STARTING_CAPITAL,
        maxTicks: RUN_MAX_TICKS,
        engineVersion: ENGINE_VERSION,
        lastTick: RUN_START_TICK,
        startedAt: now,
      };
    }
    const run = await this.db.run.create({ data });
    return runConfigDto(run);
  }

  async active(userId: string): Promise<RunConfigDto | null> {
    await this.expireStale(userId);
    const run = await this.db.run.findFirst({ where: { userId, status: 'ACTIVE' } });
    return run ? runConfigDto(run) : null;
  }

  private async storeActions(
    run: Run,
    actions: readonly GameActionDto[],
    clientTick: number,
  ): Promise<Run> {
    const actionsOnLastTick = await this.db.runAction.count({
      where: { runId: run.id, tick: run.lastTick },
    });
    validateActionBatch({ ...run, actionsOnLastTick }, actions, clientTick, this.now());
    if (actions.length === 0) return run;
    const lastTick = actions[actions.length - 1]?.tick ?? run.lastTick;
    return this.db.$transaction(async (tx) => {
      // Optimistic lock: concurrent checkpoints cannot interleave sequence numbers.
      const claimed = await tx.run.updateMany({
        where: { id: run.id, actionCount: run.actionCount, status: 'ACTIVE' },
        data: { actionCount: run.actionCount + actions.length, lastTick },
      });
      if (claimed.count === 0) throw conflict('CONFLICT', 'Concurrent checkpoint, retry');
      await tx.runAction.createMany({
        data: actions.map((a, i) => ({
          runId: run.id,
          seq: run.actionCount + i,
          tick: a.tick,
          type: a.type,
          payload: 'payload' in a ? (a.payload as Prisma.InputJsonValue) : undefined,
        })),
      });
      return tx.run.findUniqueOrThrow({ where: { id: run.id } });
    });
  }

  async appendActions(
    runId: string,
    userId: string,
    actions: readonly GameActionDto[],
    clientTick: number,
  ) {
    const run = await this.getActiveOwnRun(runId, userId);
    const updated = await this.storeActions(run, actions, clientTick);
    return { accepted: actions.length, lastTick: updated.lastTick };
  }

  async abandon(runId: string, userId: string): Promise<RunResultDto> {
    const run = await this.getActiveOwnRun(runId, userId);
    const updated = await this.db.run.update({
      where: { id: run.id },
      data: { status: 'ABANDONED', finishedAt: this.now() },
    });
    return runResultDto(updated);
  }

  private async loadLog(runId: string): Promise<GameAction[]> {
    const rows = await this.db.runAction.findMany({ where: { runId }, orderBy: { seq: 'asc' } });
    return rows.map((r) => {
      const base = { tick: r.tick, type: r.type };
      return (r.payload === null ? base : { ...base, payload: r.payload }) as GameAction;
    });
  }

  /**
   * Authoritative end of a run: the server replays the logged actions on its
   * own copy of the engine and ignores the client's result except for comparison.
   */
  async finish(runId: string, userId: string, body: FinishRunBody): Promise<RunResultDto> {
    let run = await this.getActiveOwnRun(runId, userId);
    run = await this.storeActions(run, body.actions ?? [], body.finalTick);

    const config = {
      seed: run.seed,
      startTime: Number(run.startTime),
      startingBalance: run.startingBalance,
      maxTicks: run.maxTicks,
      engineVersion: run.engineVersion,
    };
    const replay = replayRun(config, await this.loadLog(run.id), body.finalTick);
    const s = replay.summary;

    const flags: RunFlag[] = [];
    if (body.engineVersion !== run.engineVersion || run.engineVersion !== ENGINE_VERSION)
      flags.push('ENGINE_VERSION_MISMATCH');
    if (replay.rejected.length > 0) flags.push('REJECTED_ACTIONS');
    const clientEquity = body.clientSummary.finalEquity;
    const diff = Math.abs(clientEquity - s.finalEquity) / Math.max(1, Math.abs(s.finalEquity));
    if (diff > EQUITY_TOLERANCE) flags.push('CLIENT_MISMATCH');
    if (s.roi > SUSPICIOUS_ROI) flags.push('UNREALISTIC_GROWTH');

    const needsReview = flags.some((f) => REVIEW_FLAGS.includes(f));
    if (flags.length) {
      this.app.log.warn(
        {
          runId: run.id,
          userId,
          flags,
          clientEquity,
          serverEquity: s.finalEquity,
          rejected: replay.rejected.slice(0, 10),
        },
        'run flagged during verification',
      );
    }

    const finishedAt = this.now();
    run = await this.db.run.update({
      where: { id: run.id },
      data: {
        status: needsReview ? 'FLAGGED' : 'FINISHED',
        ranked: false,
        flags,
        clientEngine: body.engineVersion,
        finishedAt,
        clientEquity,
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
        lastTick: replay.finalTick,
      },
    });

    if (needsReview) return runResultDto(run);
    return this.applyVerifiedRun(run, s, replay.state.account.trades);
  }

  /**
   * Credits a verified run: profile stats, XP, achievements and (if the engine
   * version matches) leaderboards. Also used when a moderator approves a flagged run.
   */
  async applyVerifiedRun(
    run: Run,
    summary: RunSummary,
    trades: ReadonlyArray<{ pnl: number }>,
  ): Promise<RunResultDto> {
    const rankable = !run.flags.includes('ENGINE_VERSION_MISMATCH');
    const user = await this.db.user.findUniqueOrThrow({ where: { id: run.userId } });

    const owned = await this.db.userAchievement.findMany({
      where: { userId: run.userId },
      select: { achievementId: true },
    });
    const ownedIds = new Set(owned.map((o) => o.achievementId));
    const fresh = summary.achievements.filter((id) => !ownedIds.has(id));
    const achievementXp = ACHIEVEMENTS.filter((a) => fresh.includes(a.id)).reduce(
      (sum, a) => sum + a.xp,
      0,
    );
    const xpGained = trades.reduce((sum, t) => sum + xpForTrade(t), 0) + achievementXp;
    const wins = trades.filter((t) => t.pnl > 0).length;

    const updated = await this.db.$transaction(async (tx) => {
      if (fresh.length) {
        await tx.userAchievement.createMany({
          data: fresh.map((achievementId) => ({
            userId: run.userId,
            achievementId,
            runId: run.id,
          })),
          skipDuplicates: true,
        });
      }
      const profile = await tx.profile.upsert({
        where: { userId: run.userId },
        create: { userId: run.userId },
        update: {},
      });
      const xp = profile.xp + xpGained;
      await tx.profile.update({
        where: { userId: run.userId },
        data: {
          xp,
          level: levelForXp(xp).level,
          totalRuns: { increment: 1 },
          totalTrades: { increment: summary.totalTrades },
          wins: { increment: wins },
          bestEquity: Math.max(profile.bestEquity ?? -Infinity, summary.finalEquity),
          bestRoi: Math.max(profile.bestRoi ?? -Infinity, summary.roi),
        },
      });
      return tx.run.update({
        where: { id: run.id },
        data: { status: 'FINISHED', ranked: rankable, xpGained },
      });
    });

    if (rankable) {
      await this.leaderboards.record({
        userId: run.userId,
        runId: run.id,
        mode: run.mode,
        dailyDate: run.dailyDate,
        summary,
        finishedAt: run.finishedAt ?? this.now(),
        hidden: user.hideFromLeaderboard,
      });
    }
    return runResultDto(updated, fresh);
  }

  /** Moderator approval of a flagged run: re-verify by replay and credit it. */
  async approveFlagged(runId: string): Promise<RunResultDto> {
    const run = await this.db.run.findUnique({ where: { id: runId } });
    if (!run || run.status !== 'FLAGGED')
      throw notFound('RUN_NOT_FOUND', 'No flagged run with this id');
    const replay = replayRun(
      {
        seed: run.seed,
        startTime: Number(run.startTime),
        startingBalance: run.startingBalance,
        maxTicks: run.maxTicks,
        engineVersion: run.engineVersion,
      },
      await this.loadLog(run.id),
      run.lastTick,
    );
    return this.applyVerifiedRun(run, replay.summary, replay.state.account.trades);
  }
}
