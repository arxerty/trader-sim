import { dailyChallengeSchema, dayKey, startOfUtcDay } from '@trader-sim/shared';
import type { App } from '../../types';
import { LeaderboardService } from '../leaderboards/service';

export async function dailyRoutes(app: App): Promise<void> {
  const leaderboards = new LeaderboardService(app);

  app.get(
    '/',
    {
      preHandler: app.optionalAuth,
      schema: {
        tags: ['daily'],
        description:
          'Today’s challenge (UTC): same seed for everyone, one counted attempt per day.',
        response: { 200: dailyChallengeSchema },
      },
    },
    async (req) => {
      const now = app.clock.now();
      const date = dayKey(now);
      const resetsIn = Math.ceil(
        (startOfUtcDay(now).getTime() + 86_400_000 - now.getTime()) / 1000,
      );
      const participants = await app.prisma.run.count({
        where: { mode: 'DAILY', dailyDate: date },
      });
      const userId = req.auth?.id;
      if (!userId)
        return { date, resetsIn, played: false, activeRunId: null, result: null, participants };

      const run = await app.prisma.run.findFirst({
        where: { userId, mode: 'DAILY', dailyDate: date },
      });
      let result = null;
      if (
        run &&
        (run.status === 'FINISHED' || run.status === 'FLAGGED') &&
        run.finalEquity !== null
      ) {
        const board = await leaderboards.resolveBoard('equity', { period: 'daily', date }, userId);
        const me = await leaderboards.me(board, userId);
        result = {
          runId: run.id,
          finalEquity: run.finalEquity,
          roi: run.roi ?? 0,
          rank: me.me?.rank ?? null,
        };
      }
      return {
        date,
        resetsIn,
        played: Boolean(run),
        activeRunId: run?.status === 'ACTIVE' ? run.id : null,
        result,
        participants,
      };
    },
  );
}
