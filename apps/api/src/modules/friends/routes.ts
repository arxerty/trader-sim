import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import {
  friendRequestBodySchema,
  friendRequestSchema,
  friendRequestsResponseSchema,
  friendsResponseSchema,
  idParamsSchema,
  nicknameParamsSchema,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { requireUser } from '../../types';
import { badRequest, conflict, notFound } from '../../lib/errors';

const okSchema = z.object({ ok: z.literal(true) });

export async function friendRoutes(app: App): Promise<void> {
  const db = app.prisma;
  const tags = ['friends'];
  const security = [{ bearerAuth: [] }];
  const userSelect = {
    nickname: true,
    avatar: true,
    profile: { select: { level: true } },
  } as const;

  app.addHook('preHandler', app.authenticate);

  app.get(
    '/',
    { schema: { tags, security, response: { 200: friendsResponseSchema } } },
    async (req) => {
      const { id } = requireUser(req.auth);
      const rows = await db.friendship.findMany({
        where: { status: 'ACCEPTED', OR: [{ requesterId: id }, { addresseeId: id }] },
        include: { requester: { select: userSelect }, addressee: { select: userSelect } },
        orderBy: { respondedAt: 'desc' },
      });
      return {
        friends: rows.map((r) => {
          const other = r.requesterId === id ? r.addressee : r.requester;
          return {
            nickname: other.nickname,
            avatar: other.avatar,
            level: other.profile?.level ?? 'novice',
            since: (r.respondedAt ?? r.createdAt).toISOString(),
          };
        }),
      };
    },
  );

  app.get(
    '/requests',
    { schema: { tags, security, response: { 200: friendRequestsResponseSchema } } },
    async (req) => {
      const { id } = requireUser(req.auth);
      const rows = await db.friendship.findMany({
        where: { status: 'PENDING', OR: [{ requesterId: id }, { addresseeId: id }] },
        include: { requester: { select: userSelect }, addressee: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
      });
      return {
        requests: rows.map((r) => {
          const incoming = r.addresseeId === id;
          const other = incoming ? r.requester : r.addressee;
          return {
            id: r.id,
            nickname: other.nickname,
            avatar: other.avatar,
            direction: incoming ? ('incoming' as const) : ('outgoing' as const),
            createdAt: r.createdAt.toISOString(),
          };
        }),
      };
    },
  );

  app.post(
    '/requests',
    {
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
      schema: {
        tags,
        security,
        body: friendRequestBodySchema,
        response: { 201: friendRequestSchema },
      },
    },
    async (req, reply) => {
      const me = requireUser(req.auth);
      const target = await db.user.findUnique({
        where: { nicknameLower: req.body.nickname.toLowerCase() },
      });
      if (!target) throw notFound('USER_NOT_FOUND', 'Player not found');
      if (target.id === me.id)
        throw badRequest('CANNOT_FRIEND_SELF', 'You cannot befriend yourself');

      const existing = await db.friendship.findFirst({
        where: {
          OR: [
            { requesterId: me.id, addresseeId: target.id },
            { requesterId: target.id, addresseeId: me.id },
          ],
        },
      });
      if (existing?.status === 'ACCEPTED') throw conflict('ALREADY_FRIENDS', 'Already friends');
      if (existing && existing.requesterId === me.id)
        throw conflict('FRIEND_REQUEST_EXISTS', 'Request already sent');
      if (existing) {
        // They already asked us – sending a request back accepts it.
        await db.friendship.update({
          where: { id: existing.id },
          data: { status: 'ACCEPTED', respondedAt: app.clock.now() },
        });
        return reply.status(201).send({
          id: existing.id,
          nickname: target.nickname,
          avatar: target.avatar,
          direction: 'incoming',
          createdAt: existing.createdAt.toISOString(),
        });
      }
      const created = await db.friendship.create({
        data: { requesterId: me.id, addresseeId: target.id },
      });
      return reply.status(201).send({
        id: created.id,
        nickname: target.nickname,
        avatar: target.avatar,
        direction: 'outgoing',
        createdAt: created.createdAt.toISOString(),
      });
    },
  );

  const respond = (accept: boolean) => async (req: FastifyRequest<{ Params: { id: string } }>) => {
    const { id } = requireUser(req.auth);
    const request = await db.friendship.findFirst({
      where: { id: req.params.id, addresseeId: id, status: 'PENDING' },
    });
    if (!request) throw notFound('NOT_FOUND', 'Friend request not found');
    if (accept) {
      await db.friendship.update({
        where: { id: request.id },
        data: { status: 'ACCEPTED', respondedAt: app.clock.now() },
      });
    } else {
      await db.friendship.delete({ where: { id: request.id } });
    }
    return { ok: true as const };
  };

  app.post(
    '/requests/:id/accept',
    { schema: { tags, security, params: idParamsSchema, response: { 200: okSchema } } },
    respond(true),
  );
  app.post(
    '/requests/:id/decline',
    { schema: { tags, security, params: idParamsSchema, response: { 200: okSchema } } },
    respond(false),
  );

  app.delete(
    '/:nickname',
    { schema: { tags, security, params: nicknameParamsSchema, response: { 200: okSchema } } },
    async (req) => {
      const { id } = requireUser(req.auth);
      const other = await db.user.findUnique({
        where: { nicknameLower: req.params.nickname.toLowerCase() },
      });
      if (!other) throw notFound('USER_NOT_FOUND', 'Player not found');
      await db.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: id, addresseeId: other.id },
            { requesterId: other.id, addresseeId: id },
          ],
        },
      });
      return { ok: true as const };
    },
  );
}
