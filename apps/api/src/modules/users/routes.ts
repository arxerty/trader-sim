import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import {
  cloudSettingsSchema,
  deleteAccountBodySchema,
  guestProgressSchema,
  meSchema,
  nicknameParamsSchema,
  privacyBodySchema,
  progressSchema,
  publicProfileSchema,
  putSettingsBodySchema,
  settingsSyncSchema,
  updateMeBodySchema,
  type CloudSettings,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { requireUser } from '../../types';
import { verifyPassword } from '../../lib/crypto';
import { badRequest, conflict, forbidden, notFound } from '../../lib/errors';
import { clearSessionCookies } from '../../plugins/auth';
import { AuthService } from '../auth/service';
import { LeaderboardService } from '../leaderboards/service';
import { toMe } from './dto';

const DEFAULT_SETTINGS: CloudSettings = {
  locale: 'en',
  theme: 'system',
  soundEnabled: true,
  volume: 0.5,
  speed: 1,
};

export async function userRoutes(app: App): Promise<void> {
  const auth = new AuthService(app);
  const leaderboards = new LeaderboardService(app);
  const tags = ['users'];
  const security = [{ bearerAuth: [] }];
  const db = app.prisma;

  const loadMe = async (id: string) => {
    const user = await db.user.findUnique({ where: { id } });
    if (!user) throw notFound('USER_NOT_FOUND', 'User no longer exists');
    return user;
  };

  app.get(
    '/me',
    { preHandler: app.authenticate, schema: { tags, security, response: { 200: meSchema } } },
    async (req) => toMe(await loadMe(requireUser(req.auth).id)),
  );

  app.patch(
    '/me',
    {
      preHandler: app.authenticate,
      schema: { tags, security, body: updateMeBodySchema, response: { 200: meSchema } },
    },
    async (req) => {
      const { id } = requireUser(req.auth);
      const data: Prisma.UserUpdateInput = {};
      if (req.body.nickname) {
        await auth.assertNicknameAvailable(req.body.nickname, id);
        data.nickname = req.body.nickname;
        data.nicknameLower = req.body.nickname.toLowerCase();
      }
      if (req.body.avatar !== undefined) data.avatar = req.body.avatar;
      if (req.body.locale) data.locale = req.body.locale;
      if (req.body.theme) data.theme = req.body.theme;
      return toMe(await db.user.update({ where: { id }, data }));
    },
  );

  app.patch(
    '/me/privacy',
    {
      preHandler: app.authenticate,
      schema: { tags, security, body: privacyBodySchema, response: { 200: meSchema } },
    },
    async (req) => {
      const user = await db.user.update({
        where: { id: requireUser(req.auth).id },
        data: { hideFromLeaderboard: req.body.hideFromLeaderboard },
      });
      await app.leaderboardCache.invalidateAll();
      return toMe(user);
    },
  );

  app.get(
    '/me/settings',
    {
      preHandler: app.authenticate,
      schema: { tags, security, response: { 200: settingsSyncSchema } },
    },
    async (req) => {
      const user = await loadMe(requireUser(req.auth).id);
      const parsed = cloudSettingsSchema.safeParse(user.settings);
      return {
        settings: parsed.success
          ? parsed.data
          : { ...DEFAULT_SETTINGS, locale: toMe(user).locale, theme: toMe(user).theme },
        version: user.settingsVersion,
        updatedAt: user.settingsUpdatedAt.toISOString(),
      };
    },
  );

  app.put(
    '/me/settings',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security,
        description:
          'Optimistic concurrency: `baseVersion` must equal the stored version, otherwise 409 VERSION_CONFLICT with the server copy.',
        body: putSettingsBodySchema,
        response: { 200: settingsSyncSchema },
      },
    },
    async (req) => {
      const { id } = requireUser(req.auth);
      const now = app.clock.now();
      const res = await db.user.updateMany({
        where: { id, settingsVersion: req.body.baseVersion },
        data: {
          settings: req.body.settings,
          settingsVersion: { increment: 1 },
          settingsUpdatedAt: now,
          locale: req.body.settings.locale,
          theme: req.body.settings.theme,
        },
      });
      const user = await loadMe(id);
      const current = {
        settings: cloudSettingsSchema.safeParse(user.settings).data ?? DEFAULT_SETTINGS,
        version: user.settingsVersion,
        updatedAt: user.settingsUpdatedAt.toISOString(),
      };
      if (res.count === 0)
        throw conflict('VERSION_CONFLICT', 'Settings were changed on another device', current);
      return current;
    },
  );

  app.get(
    '/me/progress',
    { preHandler: app.authenticate, schema: { tags, security, response: { 200: progressSchema } } },
    async (req) => {
      const { id } = requireUser(req.auth);
      const [profile, achievements] = await Promise.all([
        db.profile.findUnique({ where: { userId: id } }),
        db.userAchievement.findMany({ where: { userId: id }, orderBy: { unlockedAt: 'asc' } }),
      ]);
      return {
        xp: profile?.xp ?? 0,
        level: profile?.level ?? 'novice',
        achievements: achievements.map((a) => ({
          id: a.achievementId,
          unlockedAt: a.unlockedAt.toISOString(),
        })),
      };
    },
  );

  app.post(
    '/me/import-guest',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security,
        description:
          'Links local guest progress to the account (XP is capped and never used for ranking).',
        body: guestProgressSchema,
        response: { 200: z.object({ xp: z.number(), achievements: z.number() }) },
      },
    },
    async (req) => auth.importGuestProgress(requireUser(req.auth).id, req.body),
  );

  app.get(
    '/me/export',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security,
        description: 'GDPR data export (JSON).',
        response: { 200: z.record(z.string(), z.unknown()) },
      },
    },
    async (req, reply) => {
      const { id } = requireUser(req.auth);
      const user = await db.user.findUniqueOrThrow({
        where: { id },
        include: {
          profile: true,
          achievements: true,
          runs: {
            orderBy: { startedAt: 'desc' },
            include: { actions: { orderBy: { seq: 'asc' } } },
          },
          sentRequests: { include: { addressee: { select: { nickname: true } } } },
          receivedRequests: { include: { requester: { select: { nickname: true } } } },
          refreshTokens: {
            select: {
              createdAt: true,
              expiresAt: true,
              revokedAt: true,
              userAgent: true,
              ip: true,
            },
          },
          oauthAccounts: { select: { provider: true, createdAt: true } },
        },
      });
      const { passwordHash: _omit, ...safe } = user;
      reply.header('content-disposition', `attachment; filename="tradesim-${user.nickname}.json"`);
      // BigInt (run start time, action ids) is not JSON-serialisable.
      return JSON.parse(
        JSON.stringify({ exportedAt: app.clock.now().toISOString(), user: safe }, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        ),
      ) as Record<string, unknown>;
    },
  );

  app.delete(
    '/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security,
        body: deleteAccountBodySchema,
        response: { 200: z.object({ deleted: z.literal(true) }) },
      },
    },
    async (req, reply) => {
      const user = await loadMe(requireUser(req.auth).id);
      if (user.passwordHash) {
        if (!req.body.password || !(await verifyPassword(user.passwordHash, req.body.password))) {
          throw forbidden('INVALID_CREDENTIALS', 'Password confirmation failed');
        }
      } else if (req.body.confirmNickname !== user.nickname) {
        throw badRequest('VALIDATION_ERROR', 'Type your nickname to confirm');
      }
      await db.user.delete({ where: { id: user.id } });
      await app.leaderboardCache.invalidateAll();
      clearSessionCookies(app, reply);
      return { deleted: true as const };
    },
  );

  app.get(
    '/users/:nickname',
    {
      preHandler: app.optionalAuth,
      schema: { tags, params: nicknameParamsSchema, response: { 200: publicProfileSchema } },
    },
    async (req) => {
      const user = await db.user.findUnique({
        where: { nicknameLower: req.params.nickname.toLowerCase() },
        include: { profile: true, achievements: { orderBy: { unlockedAt: 'asc' } } },
      });
      const viewerId = req.auth?.id ?? null;
      // Hidden profiles are visible only to their owner.
      if (!user || (user.hideFromLeaderboard && user.id !== viewerId))
        throw notFound('USER_NOT_FOUND', 'Player not found');
      const [bestRuns, friendIds] = await Promise.all([
        db.run.findMany({
          where: { userId: user.id, status: 'FINISHED', ranked: true },
          orderBy: { finalEquity: 'desc' },
          take: 5,
        }),
        viewerId ? leaderboards.friendIds(viewerId) : Promise.resolve([]),
      ]);
      const p = user.profile;
      return {
        nickname: user.nickname,
        avatar: user.avatar,
        level: p?.level ?? 'novice',
        xp: p?.xp ?? 0,
        memberSince: user.createdAt.toISOString(),
        stats: {
          runs: p?.totalRuns ?? 0,
          totalTrades: p?.totalTrades ?? 0,
          winRate: p && p.totalTrades > 0 ? p.wins / p.totalTrades : 0,
          bestEquity: p?.bestEquity ?? null,
          bestRoi: p?.bestRoi ?? null,
        },
        achievements: user.achievements.map((a) => ({
          id: a.achievementId,
          unlockedAt: a.unlockedAt.toISOString(),
        })),
        bestRuns: bestRuns.map((r) => ({
          runId: r.id,
          mode: r.mode.toLowerCase(),
          finalEquity: r.finalEquity ?? 0,
          roi: r.roi ?? 0,
          finishedAt: (r.finishedAt ?? r.startedAt).toISOString(),
        })),
        isFriend: friendIds.includes(user.id),
      };
    },
  );
}
