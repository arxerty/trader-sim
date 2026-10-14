import { z } from 'zod';
import type { FastifyRequest } from 'fastify';
import {
  authResponseSchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  providersResponseSchema,
  registerBodySchema,
  resetPasswordBodySchema,
  tokenBodySchema,
} from '@trader-sim/shared';
import type { App } from '../../types';
import { requireUser } from '../../types';
import {
  assertCsrf,
  clearSessionCookies,
  REFRESH_COOKIE,
  setSessionCookies,
} from '../../plugins/auth';
import { toMe } from '../users/dto';
import { AuthService, type ClientMeta } from './service';
import { enabledProviders } from './oauth';

const meta = (req: FastifyRequest): ClientMeta => ({
  ip: req.ip,
  userAgent: req.headers['user-agent'],
});
const okSchema = z.object({ ok: z.literal(true) });

export async function authRoutes(app: App): Promise<void> {
  const auth = new AuthService(app);
  const authLimit = {
    rateLimit: { max: app.config.RATE_LIMIT_AUTH_PER_MINUTE, timeWindow: '1 minute' },
  };
  const tags = ['auth'];

  app.post(
    '/register',
    {
      config: authLimit,
      schema: { tags, body: registerBodySchema, response: { 201: authResponseSchema } },
    },
    async (req, reply) => {
      const session = await auth.register(req.body, meta(req));
      setSessionCookies(app, reply, session.refreshToken);
      return reply.status(201).send({ accessToken: session.accessToken, user: toMe(session.user) });
    },
  );

  app.post(
    '/login',
    {
      config: authLimit,
      schema: { tags, body: loginBodySchema, response: { 200: authResponseSchema } },
    },
    async (req, reply) => {
      const session = await auth.login(req.body.email, req.body.password, meta(req));
      setSessionCookies(app, reply, session.refreshToken);
      return { accessToken: session.accessToken, user: toMe(session.user) };
    },
  );

  app.post(
    '/refresh',
    {
      config: authLimit,
      schema: {
        tags,
        description:
          'Rotates the refresh cookie. Requires the `x-csrf-token` header (double-submit).',
        response: { 200: authResponseSchema },
      },
    },
    async (req, reply) => {
      assertCsrf(req);
      try {
        const session = await auth.refresh(req.cookies[REFRESH_COOKIE], meta(req));
        setSessionCookies(app, reply, session.refreshToken);
        return { accessToken: session.accessToken, user: toMe(session.user) };
      } catch (error) {
        clearSessionCookies(app, reply);
        throw error;
      }
    },
  );

  app.post('/logout', { schema: { tags, response: { 200: okSchema } } }, async (req, reply) => {
    assertCsrf(req);
    await auth.logout(req.cookies[REFRESH_COOKIE]);
    clearSessionCookies(app, reply);
    return { ok: true as const };
  });

  app.post(
    '/logout-all',
    {
      preHandler: app.authenticate,
      schema: {
        tags,
        security: [{ bearerAuth: [] }],
        response: { 200: z.object({ revoked: z.number() }) },
      },
    },
    async (req, reply) => {
      const revoked = await auth.logoutAll(requireUser(req.auth).id);
      clearSessionCookies(app, reply);
      return { revoked };
    },
  );

  app.post(
    '/verify-email',
    { config: authLimit, schema: { tags, body: tokenBodySchema, response: { 200: okSchema } } },
    async (req) => {
      await auth.verifyEmail(req.body.token);
      return { ok: true as const };
    },
  );

  app.post(
    '/resend-verification',
    {
      preHandler: app.authenticate,
      config: authLimit,
      schema: { tags, security: [{ bearerAuth: [] }], response: { 200: okSchema } },
    },
    async (req) => {
      const user = await app.prisma.user.findUniqueOrThrow({
        where: { id: requireUser(req.auth).id },
      });
      await auth.sendVerification(user);
      return { ok: true as const };
    },
  );

  app.post(
    '/forgot-password',
    {
      config: authLimit,
      schema: { tags, body: forgotPasswordBodySchema, response: { 200: okSchema } },
    },
    async (req) => {
      await auth.forgotPassword(req.body.email);
      return { ok: true as const };
    },
  );

  app.post(
    '/reset-password',
    {
      config: authLimit,
      schema: { tags, body: resetPasswordBodySchema, response: { 200: okSchema } },
    },
    async (req) => {
      await auth.resetPassword(req.body.token, req.body.password);
      return { ok: true as const };
    },
  );

  app.get(
    '/providers',
    { schema: { tags, response: { 200: providersResponseSchema } } },
    async () => ({
      providers: enabledProviders(app.config),
    }),
  );
}
