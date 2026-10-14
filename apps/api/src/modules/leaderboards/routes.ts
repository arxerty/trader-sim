import {
  leaderboardMeSchema,
  leaderboardPageSchema,
  leaderboardParamsSchema,
  leaderboardQuerySchema,
  seasonKey,
  seasonsResponseSchema,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { requireUser } from '../../types';
import { LeaderboardService } from './service';

export async function leaderboardRoutes(app: App): Promise<void> {
  const service = new LeaderboardService(app);
  const tags = ['leaderboards'];

  app.get(
    '/leaderboards/:type',
    {
      preHandler: app.optionalAuth,
      schema: {
        tags,
        description:
          'Paginated leaderboard (keyset cursor). `period=friends` requires authentication.',
        params: leaderboardParamsSchema,
        querystring: leaderboardQuerySchema,
        response: { 200: leaderboardPageSchema },
      },
    },
    async (req) => {
      const board = await service.resolveBoard(req.params.type, req.query, req.auth?.id ?? null);
      return service.page(board, req.query.cursor, req.query.limit);
    },
  );

  app.get(
    '/leaderboards/:type/me',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security: [{ bearerAuth: [] }],
        description: 'My position on the board plus neighbours above and below.',
        params: leaderboardParamsSchema,
        querystring: leaderboardQuerySchema,
        response: { 200: leaderboardMeSchema },
      },
    },
    async (req) => {
      const user = requireUser(req.auth);
      const board = await service.resolveBoard(req.params.type, req.query, user.id);
      return service.me(board, user.id);
    },
  );

  app.get('/seasons', { schema: { tags, response: { 200: seasonsResponseSchema } } }, async () => {
    const current = seasonKey(app.clock.now());
    await service.ensureSeason(current);
    const seasons = await app.prisma.season.findMany({ orderBy: { key: 'desc' }, take: 36 });
    return {
      current,
      seasons: seasons.map((s) => ({
        key: s.key,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
      })),
    };
  });
}
