import { z } from 'zod';
import { LEADERBOARD_PAGE_MAX } from '../constants';

/**
 * Leaderboard metrics. To add a new type: add it here, map it to a RunSummary
 * value in `apps/api/src/modules/leaderboards/metrics.ts` and add translations
 * under `leaderboards.types.<type>` (see README → "New leaderboard type").
 */
export const LEADERBOARD_TYPES = ['equity', 'roi', 'bestTrade', 'streak', 'risk'] as const;
export const leaderboardTypeSchema = z.enum(LEADERBOARD_TYPES);
export type LeaderboardType = z.infer<typeof leaderboardTypeSchema>;

export const LEADERBOARD_PERIODS = ['all', 'week', 'season', 'daily', 'friends'] as const;
export const leaderboardPeriodSchema = z.enum(LEADERBOARD_PERIODS);
export type LeaderboardPeriod = z.infer<typeof leaderboardPeriodSchema>;

export const leaderboardQuerySchema = z.object({
  period: leaderboardPeriodSchema.default('all'),
  /** Season key `YYYY-MM` (defaults to the current one) – for the archive. */
  season: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  /** Day key `YYYY-MM-DD` for the daily board (defaults to today, UTC). */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(LEADERBOARD_PAGE_MAX).default(20),
});
export type LeaderboardQuery = z.input<typeof leaderboardQuerySchema>;

export const leaderboardParamsSchema = z.object({ type: leaderboardTypeSchema });

export const leaderboardRowSchema = z.object({
  rank: z.number().int(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  level: z.string(),
  value: z.number(),
  runId: z.string(),
  achievedAt: z.string(),
});
export type LeaderboardRow = z.infer<typeof leaderboardRowSchema>;

export const leaderboardPageSchema = z.object({
  type: leaderboardTypeSchema,
  period: leaderboardPeriodSchema,
  periodKey: z.string(),
  items: z.array(leaderboardRowSchema),
  nextCursor: z.string().nullable(),
});
export type LeaderboardPage = z.infer<typeof leaderboardPageSchema>;

export const leaderboardMeSchema = z.object({
  me: leaderboardRowSchema.nullable(),
  above: z.array(leaderboardRowSchema),
  below: z.array(leaderboardRowSchema),
});
export type LeaderboardMe = z.infer<typeof leaderboardMeSchema>;

export const seasonsResponseSchema = z.object({
  current: z.string(),
  seasons: z.array(z.object({ key: z.string(), startsAt: z.string(), endsAt: z.string() })),
});
