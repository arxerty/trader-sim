import type { FastifyBaseLogger } from 'fastify';
import type { Config } from '../../config';

export interface ScoredMember {
  userId: string;
  score: number;
}

/**
 * Optional cache of the top of each board in Redis sorted sets.
 * Postgres stays the source of truth; the cache is write-through on new
 * records and rebuilt lazily when a key is missing.
 */
export interface LeaderboardCache {
  readonly enabled: boolean;
  /** Top `limit` members or null when the key is cold (caller must rebuild). */
  top(key: string, limit: number): Promise<ScoredMember[] | null>;
  rebuild(key: string, members: ScoredMember[]): Promise<void>;
  /** Raises the member's score if the new one is higher (ZADD GT). */
  record(key: string, member: ScoredMember): Promise<void>;
  invalidateAll(): Promise<void>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

const noopCache: LeaderboardCache = {
  enabled: false,
  top: async () => null,
  rebuild: async () => undefined,
  record: async () => undefined,
  invalidateAll: async () => undefined,
  ping: async () => false,
  close: async () => undefined,
};

const TTL_SECONDS = 3600;
const PREFIX = 'lb:';

export async function createLeaderboardCache(
  config: Config,
  log: FastifyBaseLogger,
): Promise<LeaderboardCache> {
  if (config.LEADERBOARD_CACHE !== 'redis' || !config.REDIS_URL) return noopCache;
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 2 });
  redis.on('error', (err) => log.warn({ err }, 'redis error'));
  log.info('leaderboard cache: redis sorted sets enabled');

  // Any Redis failure degrades to Postgres instead of failing the request.
  const safe = async <T>(fallback: T, fn: () => Promise<T>): Promise<T> => {
    try {
      return await fn();
    } catch (err) {
      log.warn({ err }, 'redis cache unavailable, falling back to postgres');
      return fallback;
    }
  };

  return {
    enabled: true,
    top: (key, limit) =>
      safe(null, async () => {
        if (!(await redis.exists(PREFIX + key))) return null;
        const flat = await redis.zrevrange(PREFIX + key, 0, limit - 1, 'WITHSCORES');
        const out: ScoredMember[] = [];
        for (let i = 0; i < flat.length; i += 2)
          out.push({ userId: flat[i] as string, score: Number(flat[i + 1]) });
        return out;
      }),
    rebuild: (key, members) =>
      safe(undefined, async () => {
        const multi = redis.multi().del(PREFIX + key);
        if (members.length)
          multi.zadd(PREFIX + key, ...members.flatMap((m) => [m.score, m.userId]));
        await multi.expire(PREFIX + key, TTL_SECONDS).exec();
      }),
    record: (key, member) =>
      safe(undefined, async () => {
        if (await redis.exists(PREFIX + key))
          await redis.zadd(PREFIX + key, 'GT', member.score, member.userId);
      }),
    invalidateAll: () =>
      safe(undefined, async () => {
        let cursor = '0';
        do {
          const [next, keys] = await redis.scan(cursor, 'MATCH', `${PREFIX}*`, 'COUNT', 200);
          cursor = next;
          if (keys.length) await redis.del(...keys);
        } while (cursor !== '0');
      }),
    ping: () => safe(false, async () => (await redis.ping()) === 'PONG'),
    close: async () => {
      redis.disconnect();
    },
  };
}
