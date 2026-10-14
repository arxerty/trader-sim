import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import { idParamsSchema, runResultSchema } from '@trader-sim/shared';
import type { App } from '../../types';
import { safeEqual } from '../../lib/crypto';
import { forbidden } from '../../lib/errors';
import { runResultDto, RunService } from '../runs/service';

/** Minimal moderation API for runs held back by the anti-cheat (header `x-admin-token`). */
export async function adminRoutes(app: App): Promise<void> {
  const runs = new RunService(app);
  const tags = ['admin'];

  app.addHook('preHandler', async (req: FastifyRequest) => {
    const expected = app.config.ADMIN_TOKEN;
    const given = req.headers['x-admin-token'];
    if (!expected || typeof given !== 'string' || !safeEqual(expected, given)) throw forbidden();
  });

  app.get(
    '/runs/flagged',
    { schema: { tags, response: { 200: z.object({ runs: z.array(runResultSchema) }) } } },
    async () => {
      const rows = await app.prisma.run.findMany({
        where: { status: 'FLAGGED' },
        orderBy: { finishedAt: 'desc' },
        take: 100,
      });
      return { runs: rows.map((r) => runResultDto(r)) };
    },
  );

  app.post(
    '/runs/:id/approve',
    { schema: { tags, params: idParamsSchema, response: { 200: runResultSchema } } },
    async (req) => runs.approveFlagged(req.params.id),
  );
}
