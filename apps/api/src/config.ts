import { z } from 'zod';

const bool = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),
  /** Enables the Redis sorted-set cache for leaderboards. Without it everything runs on Postgres. */
  REDIS_URL: z.string().optional(),
  LEADERBOARD_CACHE: z.enum(['none', 'redis']).default('none'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().default(30),
  /** Secret mixed into the daily challenge seed so it cannot be predicted in advance. */
  DAILY_SEED_SECRET: z.string().min(8),
  /** Token for the moderation endpoints (review of flagged runs). Disabled when empty. */
  ADMIN_TOKEN: z.string().optional(),

  /** Public URL of the web app (links in e-mails, OAuth redirects). */
  WEB_URL: z.string().default('http://localhost:5173'),
  /** Public URL under which the API is reachable from the browser. */
  API_PUBLIC_URL: z.string().default('http://localhost:5173/api'),
  /** Comma-separated CORS allow-list. */
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  COOKIE_SECURE: bool.optional(),
  /** Path prefix under which the web app reaches the API (cookie path for refresh tokens). */
  COOKIE_PATH_PREFIX: z.string().default('/api'),

  RATE_LIMIT_ENABLED: bool.default(true),
  RATE_LIMIT_AUTH_PER_MINUTE: z.coerce.number().int().default(10),
  RATE_LIMIT_RUNS_PER_MINUTE: z.coerce.number().int().default(60),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  MAIL_FROM: z.string().default('TradeSim <no-reply@tradesim.local>'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),

  SWAGGER_ENABLED: bool.default(true),
});

export type Config = z.infer<typeof envSchema> & { cookieSecure: boolean; corsOrigins: string[] };

export function loadConfig(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Record<string, string>> = {},
): Config {
  const parsed = envSchema.safeParse({ ...env, ...overrides });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const c = parsed.data;
  return {
    ...c,
    cookieSecure: c.COOKIE_SECURE ?? c.NODE_ENV === 'production',
    corsOrigins: c.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  };
}
