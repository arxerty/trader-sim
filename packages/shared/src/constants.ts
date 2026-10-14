/** Game & anti-cheat limits shared by client and server. */
export const STARTING_CAPITAL = 10_000;

/** Live ticks per run: one hour at 1× speed. */
export const RUN_MAX_TICKS = 3600;
/** Unfinished runs expire after this many hours. */
export const RUN_TTL_HOURS = 24;
/** Fastest game speed (5×) means at most 5 ticks per real second. */
export const MAX_TICKS_PER_SECOND = 5;
/** Grace for network latency / clock skew when checking tick pacing. */
export const TICK_PACING_SLACK = 30;
export const MAX_ACTIONS_PER_BATCH = 200;
export const MAX_ACTIONS_PER_RUN = 5000;
export const MAX_ACTIONS_PER_TICK = 5;
/** ROI above this (as a fraction) is considered unrealistic and held for review. */
export const SUSPICIOUS_ROI = 5;
/** Relative difference between client and server equity tolerated as float noise. */
export const EQUITY_TOLERANCE = 1e-6;

export const NICKNAME_MIN = 3;
export const NICKNAME_MAX = 20;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const LEADERBOARD_PAGE_MAX = 100;
export const LEADERBOARD_NEIGHBOURS = 2;

export const SUPPORTED_LOCALES = ['en', 'ru', 'es', 'zh', 'uk', 'de'] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const THEME_PREFERENCES = ['system', 'light', 'dark', 'terminal'] as const;
