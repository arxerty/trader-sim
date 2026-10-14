import { randomUUID } from 'node:crypto';
import type { LeaderboardMetric, PeriodType, Prisma } from '@prisma/client';
import type { RunSummary } from '@trader-sim/engine';
import {
  dayKey,
  isoWeekKey,
  LEADERBOARD_NEIGHBOURS,
  seasonBounds,
  seasonKey,
  type LeaderboardMe,
  type LeaderboardPage,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type LeaderboardType,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { badRequest, unauthorized } from '../../lib/errors';
import { METRICS } from './metrics';

export interface Board {
  type: LeaderboardType;
  period: LeaderboardPeriod;
  metric: LeaderboardMetric;
  periodType: PeriodType;
  periodKey: string;
  /** Restricts the board to these users (friends board). */
  userIds?: string[];
}

interface Cursor {
  v: number;
  t: string;
  id: string;
  r: number;
}

const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): Cursor {
  try {
    const c = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as Cursor;
    if (
      typeof c.v !== 'number' ||
      typeof c.t !== 'string' ||
      typeof c.id !== 'string' ||
      typeof c.r !== 'number'
    )
      throw new Error();
    return c;
  } catch {
    throw badRequest('VALIDATION_ERROR', 'Invalid cursor');
  }
}

const ORDER: Prisma.LeaderboardEntryOrderByWithRelationInput[] = [
  { value: 'desc' },
  { achievedAt: 'asc' },
  { id: 'asc' },
];
const REVERSE_ORDER: Prisma.LeaderboardEntryOrderByWithRelationInput[] = [
  { value: 'asc' },
  { achievedAt: 'desc' },
  { id: 'desc' },
];
const INCLUDE = {
  user: { select: { nickname: true, avatar: true, profile: { select: { level: true } } } },
} as const;
type EntryWithUser = Prisma.LeaderboardEntryGetPayload<{ include: typeof INCLUDE }>;

/** Rows strictly after `c` in board order (worse). */
const after = (c: { v: number; t: Date; id: string }): Prisma.LeaderboardEntryWhereInput => ({
  OR: [
    { value: { lt: c.v } },
    { value: c.v, achievedAt: { gt: c.t } },
    { value: c.v, achievedAt: c.t, id: { gt: c.id } },
  ],
});
/** Rows strictly before `c` in board order (better). */
const before = (c: { v: number; t: Date; id: string }): Prisma.LeaderboardEntryWhereInput => ({
  OR: [
    { value: { gt: c.v } },
    { value: c.v, achievedAt: { lt: c.t } },
    { value: c.v, achievedAt: c.t, id: { lt: c.id } },
  ],
});

const toRow = (e: EntryWithUser, rank: number): LeaderboardRow => ({
  rank,
  nickname: e.user.nickname,
  avatar: e.user.avatar,
  level: e.user.profile?.level ?? 'novice',
  value: e.value,
  runId: e.runId,
  achievedAt: e.achievedAt.toISOString(),
});

export class LeaderboardService {
  constructor(private readonly app: App) {}

  private get db() {
    return this.app.prisma;
  }

  async friendIds(userId: string): Promise<string[]> {
    const rows = await this.db.friendship.findMany({
      where: { status: 'ACCEPTED', OR: [{ requesterId: userId }, { addresseeId: userId }] },
      select: { requesterId: true, addresseeId: true },
    });
    return rows.map((r) => (r.requesterId === userId ? r.addresseeId : r.requesterId));
  }

  async resolveBoard(
    type: LeaderboardType,
    q: { period: LeaderboardPeriod; season?: string; date?: string },
    viewerId: string | null,
  ): Promise<Board> {
    const metric = METRICS[type].db;
    const now = this.app.clock.now();
    switch (q.period) {
      case 'all':
        return { type, period: q.period, metric, periodType: 'ALL', periodKey: 'all' };
      case 'week':
        return { type, period: q.period, metric, periodType: 'WEEK', periodKey: isoWeekKey(now) };
      case 'season':
        return {
          type,
          period: q.period,
          metric,
          periodType: 'SEASON',
          periodKey: q.season ?? seasonKey(now),
        };
      case 'daily':
        return {
          type,
          period: q.period,
          metric,
          periodType: 'DAILY',
          periodKey: q.date ?? dayKey(now),
        };
      case 'friends': {
        if (!viewerId) throw unauthorized('UNAUTHORIZED', 'Sign in to see the friends leaderboard');
        const userIds = [viewerId, ...(await this.friendIds(viewerId))];
        return { type, period: q.period, metric, periodType: 'ALL', periodKey: 'all', userIds };
      }
    }
  }

  private baseWhere(board: Board): Prisma.LeaderboardEntryWhereInput {
    return {
      metric: board.metric,
      periodType: board.periodType,
      periodKey: board.periodKey,
      user: { hideFromLeaderboard: false },
      ...(board.userIds ? { userId: { in: board.userIds } } : {}),
    };
  }

  private cacheKey(board: Board): string | null {
    return board.userIds ? null : `${board.metric}:${board.periodType}:${board.periodKey}`;
  }

  async page(board: Board, rawCursor: string | undefined, limit: number): Promise<LeaderboardPage> {
    const cursor = rawCursor ? decodeCursor(rawCursor) : null;
    const where: Prisma.LeaderboardEntryWhereInput = cursor
      ? {
          AND: [
            this.baseWhere(board),
            after({ v: cursor.v, t: new Date(cursor.t), id: cursor.id }),
          ],
        }
      : this.baseWhere(board);

    const cached = !cursor ? await this.fromCache(board, limit + 1) : null;
    const entries =
      cached ??
      (await this.db.leaderboardEntry.findMany({
        where,
        orderBy: ORDER,
        take: limit + 1,
        include: INCLUDE,
      }));

    const hasMore = entries.length > limit;
    const pageEntries = entries.slice(0, limit);
    const offset = cursor?.r ?? 0;
    const items = pageEntries.map((e, i) => toRow(e, offset + i + 1));
    const last = pageEntries[pageEntries.length - 1];
    return {
      type: board.type,
      period: board.period,
      periodKey: board.periodKey,
      items,
      nextCursor:
        hasMore && last
          ? encodeCursor({
              v: last.value,
              t: last.achievedAt.toISOString(),
              id: last.id,
              r: offset + pageEntries.length,
            })
          : null,
    };
  }

  /** First page via the Redis sorted set (if enabled), hydrated from Postgres. */
  private async fromCache(board: Board, take: number): Promise<EntryWithUser[] | null> {
    const cache = this.app.leaderboardCache;
    const key = this.cacheKey(board);
    if (!cache.enabled || !key) return null;
    let top = await cache.top(key, take);
    if (!top) {
      const all = await this.db.leaderboardEntry.findMany({
        where: this.baseWhere(board),
        orderBy: ORDER,
        take: 1000,
        select: { userId: true, value: true },
      });
      await cache.rebuild(
        key,
        all.map((e) => ({ userId: e.userId, score: e.value })),
      );
      top = all.slice(0, take).map((e) => ({ userId: e.userId, score: e.value }));
    }
    const entries = await this.db.leaderboardEntry.findMany({
      where: { ...this.baseWhere(board), userId: { in: top.map((m) => m.userId) } },
      include: INCLUDE,
    });
    // Postgres ordering is authoritative for ties.
    return entries.sort(
      (a, b) =>
        b.value - a.value ||
        a.achievedAt.getTime() - b.achievedAt.getTime() ||
        a.id.localeCompare(b.id),
    );
  }

  async me(board: Board, userId: string): Promise<LeaderboardMe> {
    const mine = await this.db.leaderboardEntry.findFirst({
      where: { ...this.baseWhere(board), userId },
      include: INCLUDE,
    });
    if (!mine) return { me: null, above: [], below: [] };
    const pos = { v: mine.value, t: mine.achievedAt, id: mine.id };
    const base = this.baseWhere(board);
    const [better, aboveRaw, below] = await Promise.all([
      this.db.leaderboardEntry.count({ where: { AND: [base, before(pos)] } }),
      this.db.leaderboardEntry.findMany({
        where: { AND: [base, before(pos)] },
        orderBy: REVERSE_ORDER,
        take: LEADERBOARD_NEIGHBOURS,
        include: INCLUDE,
      }),
      this.db.leaderboardEntry.findMany({
        where: { AND: [base, after(pos)] },
        orderBy: ORDER,
        take: LEADERBOARD_NEIGHBOURS,
        include: INCLUDE,
      }),
    ]);
    const rank = better + 1;
    const above = aboveRaw.reverse();
    return {
      me: toRow(mine, rank),
      above: above.map((e, i) => toRow(e, rank - above.length + i)),
      below: below.map((e, i) => toRow(e, rank + i + 1)),
    };
  }

  /** Writes a verified run into every applicable board, keeping each user's best value. */
  async record(params: {
    userId: string;
    runId: string;
    mode: 'STANDARD' | 'DAILY';
    dailyDate: string | null;
    summary: RunSummary;
    finishedAt: Date;
    hidden: boolean;
  }): Promise<void> {
    const { finishedAt } = params;
    const periods: Array<{ periodType: PeriodType; periodKey: string }> =
      params.mode === 'DAILY'
        ? [{ periodType: 'DAILY', periodKey: params.dailyDate ?? dayKey(finishedAt) }]
        : [
            { periodType: 'ALL', periodKey: 'all' },
            { periodType: 'WEEK', periodKey: isoWeekKey(finishedAt) },
            { periodType: 'SEASON', periodKey: seasonKey(finishedAt) },
          ];
    if (params.mode === 'STANDARD') await this.ensureSeason(seasonKey(finishedAt));

    for (const def of Object.values(METRICS)) {
      const value = def.value(params.summary);
      if (value === null || !Number.isFinite(value)) continue;
      for (const p of periods) {
        // Single statement upsert that only ever improves the stored value.
        const updated = await this.db.$queryRaw<Array<{ value: number }>>`
          INSERT INTO "LeaderboardEntry" ("id","userId","metric","periodType","periodKey","value","runId","achievedAt")
          VALUES (${randomUUID()}, ${params.userId}, ${def.db}::"LeaderboardMetric", ${p.periodType}::"PeriodType",
                  ${p.periodKey}, ${value}, ${params.runId}, ${finishedAt})
          ON CONFLICT ("userId","metric","periodType","periodKey")
          DO UPDATE SET "value" = EXCLUDED."value", "runId" = EXCLUDED."runId", "achievedAt" = EXCLUDED."achievedAt"
          WHERE "LeaderboardEntry"."value" < EXCLUDED."value"
          RETURNING "value"`;
        if (updated.length && !params.hidden) {
          await this.app.leaderboardCache.record(`${def.db}:${p.periodType}:${p.periodKey}`, {
            userId: params.userId,
            score: value,
          });
        }
      }
    }
  }

  async ensureSeason(key: string): Promise<void> {
    const { startsAt, endsAt } = seasonBounds(key);
    await this.db.season.upsert({ where: { key }, create: { key, startsAt, endsAt }, update: {} });
  }
}
