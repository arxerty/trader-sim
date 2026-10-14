import type { User } from '@prisma/client';
import type { Locale, Me } from '@trader-sim/shared';
import { SUPPORTED_LOCALES, THEME_PREFERENCES } from '@trader-sim/shared';

const asLocale = (v: string): Locale =>
  (SUPPORTED_LOCALES as readonly string[]).includes(v) ? (v as Locale) : 'en';
const asTheme = (v: string): Me['theme'] =>
  (THEME_PREFERENCES as readonly string[]).includes(v) ? (v as Me['theme']) : 'system';

export function toMe(user: User): Me {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    nickname: user.nickname,
    avatar: user.avatar,
    locale: asLocale(user.locale),
    theme: asTheme(user.theme),
    hideFromLeaderboard: user.hideFromLeaderboard,
    createdAt: user.createdAt.toISOString(),
  };
}
