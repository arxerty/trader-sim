import { z } from 'zod';
import { ENGINE_VERSION } from '@trader-sim/engine';
import type { App } from '../../types';

const healthSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  engineVersion: z.string(),
  db: z.enum(['up', 'down']),
  redis: z.enum(['up', 'down', 'disabled']),
  uptime: z.number(),
});

export async function healthRoutes(app: App): Promise<void> {
  app.get(
    '/health',
    {
      config: { rateLimit: false },
      schema: { tags: ['health'], response: { 200: healthSchema, 503: healthSchema } },
    },
    async (_req, reply) => {
      let db: 'up' | 'down' = 'up';
      try {
        await app.prisma.$queryRaw`SELECT 1`;
      } catch {
        db = 'down';
      }
      const redis = app.leaderboardCache.enabled
        ? (await app.leaderboardCache.ping())
          ? 'up'
          : 'down'
        : 'disabled';
      const status = db === 'up' ? 'ok' : 'degraded';
      return reply.status(db === 'up' ? 200 : 503).send({
        status,
        engineVersion: ENGINE_VERSION,
        db,
        redis,
        uptime: Math.round(process.uptime()),
      });
    },
  );
}
