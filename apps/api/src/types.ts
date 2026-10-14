import type {
  FastifyBaseLogger,
  FastifyInstance,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault,
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrismaClient } from '@prisma/client';
import type { Config } from './config';
import type { JwtService } from './lib/jwt';
import type { Mailer } from './lib/mailer';
import type { LeaderboardCache } from './modules/leaderboards/cache';

export interface Clock {
  now(): Date;
}

export interface AuthUser {
  id: string;
  nickname: string;
}

declare module 'fastify' {
  interface FastifyInstance {
    config: Config;
    prisma: PrismaClient;
    mailer: Mailer;
    jwt: JwtService;
    clock: Clock;
    leaderboardCache: LeaderboardCache;
    /** preHandler: requires a valid access token. */
    authenticate: (request: FastifyRequest) => Promise<void>;
    /** preHandler: attaches the user when a token is present, never fails. */
    optionalAuth: (request: FastifyRequest) => Promise<void>;
  }
  interface FastifyRequest {
    auth: AuthUser | null;
  }
}

export type App = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression,
  RawReplyDefaultExpression,
  FastifyBaseLogger,
  ZodTypeProvider
>;

export function requireUser(user: AuthUser | null): AuthUser {
  if (!user) throw new Error('requireUser called on an unauthenticated route');
  return user;
}
