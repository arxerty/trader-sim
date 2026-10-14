import { z } from 'zod';
import {
  NICKNAME_MAX,
  NICKNAME_MIN,
  PASSWORD_MAX,
  PASSWORD_MIN,
  SUPPORTED_LOCALES,
  THEME_PREFERENCES,
} from '../constants';
import { NICKNAME_PATTERN } from '../nickname';

/** Trimmed + lower-cased before validation so " A@B.io " and "a@b.io" are the same account. */
export const emailSchema = z.string().trim().toLowerCase().max(254).pipe(z.email());
export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);
export const nicknameSchema = z
  .string()
  .min(NICKNAME_MIN)
  .max(NICKNAME_MAX)
  .regex(NICKNAME_PATTERN);
export const localeSchema = z.enum(SUPPORTED_LOCALES);
export const themeSchema = z.enum(THEME_PREFERENCES);

/** Progress accumulated while playing as a guest, offered for import on sign-up. */
export const guestProgressSchema = z.object({
  xp: z.number().int().min(0).max(1_000_000),
  achievements: z.array(z.string().max(40)).max(100),
});
export type GuestProgress = z.infer<typeof guestProgressSchema>;

export const registerBodySchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  nickname: nicknameSchema,
  locale: localeSchema.optional(),
  guestProgress: guestProgressSchema.optional(),
});
export type RegisterBody = z.input<typeof registerBodySchema>;

export const loginBodySchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginBody = z.input<typeof loginBodySchema>;

export const tokenBodySchema = z.object({ token: z.string().min(16).max(256) });
export const forgotPasswordBodySchema = z.object({ email: emailSchema });
export const resetPasswordBodySchema = z.object({
  token: z.string().min(16).max(256),
  password: passwordSchema,
});

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  nickname: z.string(),
  avatar: z.string().nullable(),
  locale: localeSchema,
  theme: themeSchema,
  hideFromLeaderboard: z.boolean(),
  createdAt: z.string(),
});
export type Me = z.infer<typeof meSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: meSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const providersResponseSchema = z.object({
  providers: z.array(z.enum(['google', 'github'])),
});
export type OAuthProvider = 'google' | 'github';
