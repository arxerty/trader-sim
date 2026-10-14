import { z } from 'zod';
import { localeSchema, nicknameSchema, passwordSchema, themeSchema } from './auth';

export const nicknameParamsSchema = z.object({ nickname: nicknameSchema });

export const publicProfileSchema = z.object({
  nickname: z.string(),
  avatar: z.string().nullable(),
  level: z.string(),
  xp: z.number().int(),
  memberSince: z.string(),
  stats: z.object({
    runs: z.number().int(),
    totalTrades: z.number().int(),
    winRate: z.number(),
    bestEquity: z.number().nullable(),
    bestRoi: z.number().nullable(),
  }),
  achievements: z.array(z.object({ id: z.string(), unlockedAt: z.string() })),
  bestRuns: z.array(
    z.object({
      runId: z.string(),
      mode: z.string(),
      finalEquity: z.number(),
      roi: z.number(),
      finishedAt: z.string(),
    }),
  ),
  isFriend: z.boolean(),
});
export type PublicProfile = z.infer<typeof publicProfileSchema>;

export const updateMeBodySchema = z.object({
  nickname: nicknameSchema.optional(),
  avatar: z.url().max(500).nullable().optional(),
  locale: localeSchema.optional(),
  theme: themeSchema.optional(),
});

export const privacyBodySchema = z.object({ hideFromLeaderboard: z.boolean() });

export const deleteAccountBodySchema = z.object({
  /** Required for password accounts; OAuth-only accounts confirm with their nickname. */
  password: passwordSchema.optional(),
  confirmNickname: z.string().optional(),
});

/** Cloud-synced client settings with optimistic concurrency (`version`). */
export const cloudSettingsSchema = z.object({
  locale: localeSchema,
  theme: themeSchema,
  soundEnabled: z.boolean(),
  volume: z.number().min(0).max(1),
  speed: z.union([z.literal(1), z.literal(2), z.literal(5)]),
});
export type CloudSettings = z.infer<typeof cloudSettingsSchema>;

export const settingsSyncSchema = z.object({
  settings: cloudSettingsSchema,
  version: z.number().int().min(0),
  updatedAt: z.string(),
});
export type SettingsSync = z.infer<typeof settingsSyncSchema>;

export const putSettingsBodySchema = z.object({
  settings: cloudSettingsSchema,
  /** The version the client based its change on. Mismatch → 409 VERSION_CONFLICT. */
  baseVersion: z.number().int().min(0),
});

export const progressSchema = z.object({
  xp: z.number().int(),
  level: z.string(),
  achievements: z.array(z.object({ id: z.string(), unlockedAt: z.string() })),
});
export type CloudProgress = z.infer<typeof progressSchema>;
