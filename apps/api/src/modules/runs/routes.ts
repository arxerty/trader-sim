import { z } from 'zod';
import {
  actionsAcceptedSchema,
  actionsBatchBodySchema,
  createRunBodySchema,
  finishRunBodySchema,
  idParamsSchema,
  runConfigSchema,
  runResultSchema,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { requireUser } from '../../types';
import { runResultDto, RunService } from './service';

export async function runRoutes(app: App): Promise<void> {
  const service = new RunService(app);
  const tags = ['runs'];
  const security = [{ bearerAuth: [] }];
  const runLimit = {
    rateLimit: { max: app.config.RATE_LIMIT_RUNS_PER_MINUTE, timeWindow: '1 minute' },
  };

  app.addHook('preHandler', app.authenticate);

  app.post(
    '/',
    {
      config: runLimit,
      schema: {
        tags,
        security,
        description:
          'Starts a run. The server picks the seed; the client plays locally on the same engine.',
        body: createRunBodySchema,
        response: { 201: runConfigSchema },
      },
    },
    async (req, reply) =>
      reply.status(201).send(await service.create(requireUser(req.auth).id, req.body.mode)),
  );

  app.get(
    '/active',
    {
      schema: { tags, security, response: { 200: z.object({ run: runConfigSchema.nullable() }) } },
    },
    async (req) => ({ run: await service.active(requireUser(req.auth).id) }),
  );

  app.get(
    '/:id',
    { schema: { tags, security, params: idParamsSchema, response: { 200: runResultSchema } } },
    async (req) => runResultDto(await service.getOwnRun(req.params.id, requireUser(req.auth).id)),
  );

  app.post(
    '/:id/actions',
    {
      config: runLimit,
      schema: {
        tags,
        security,
        description: 'Checkpoint: appends actions `{ tick, type, payload }` to the run log.',
        params: idParamsSchema,
        body: actionsBatchBodySchema,
        response: { 200: actionsAcceptedSchema },
      },
    },
    async (req) =>
      service.appendActions(
        req.params.id,
        requireUser(req.auth).id,
        req.body.actions,
        req.body.clientTick,
      ),
  );

  app.post(
    '/:id/finish',
    {
      config: runLimit,
      schema: {
        tags,
        security,
        description:
          'Ends the run. The server replays the action log and computes the result itself; the client value is only compared.',
        params: idParamsSchema,
        body: finishRunBodySchema,
        response: { 200: runResultSchema },
      },
    },
    async (req) => service.finish(req.params.id, requireUser(req.auth).id, req.body),
  );

  app.post(
    '/:id/abandon',
    { schema: { tags, security, params: idParamsSchema, response: { 200: runResultSchema } } },
    async (req) => service.abandon(req.params.id, requireUser(req.auth).id),
  );
}
