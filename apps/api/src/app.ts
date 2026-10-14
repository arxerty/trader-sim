import Fastify, { type FastifyServerOptions } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { PrismaClient } from '@prisma/client';
import { ENGINE_VERSION } from '@trader-sim/engine';
import type { Config } from './config';
import { JwtService } from './lib/jwt';
import { createMailer, type Mailer } from './lib/mailer';
import { authPlugin } from './plugins/auth';
import { registerErrorHandling } from './plugins/errors';
import { createLeaderboardCache } from './modules/leaderboards/cache';
import { authRoutes } from './modules/auth/routes';
import { oauthRoutes } from './modules/auth/oauth';
import { userRoutes } from './modules/users/routes';
import { runRoutes } from './modules/runs/routes';
import { leaderboardRoutes } from './modules/leaderboards/routes';
import { friendRoutes } from './modules/friends/routes';
import { dailyRoutes } from './modules/daily/routes';
import { adminRoutes } from './modules/admin/routes';
import { healthRoutes } from './modules/health/routes';
import type { App, Clock } from './types';

export interface BuildOptions {
  config: Config;
  prisma?: PrismaClient;
  mailer?: Mailer;
  clock?: Clock;
  logger?: FastifyServerOptions['logger'];
}

export async function buildApp(options: BuildOptions): Promise<App> {
  const { config } = options;
  const app = Fastify({
    logger: options.logger ?? {
      level: config.LOG_LEVEL,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
      ...(config.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty' } } : {}),
    },
    trustProxy: true,
    bodyLimit: 512 * 1024,
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const prisma = options.prisma ?? new PrismaClient();
  app.decorate('config', config);
  app.decorate('prisma', prisma);
  app.decorate('clock', options.clock ?? { now: () => new Date() });
  app.decorate('jwt', new JwtService(config.JWT_SECRET, config.ACCESS_TOKEN_TTL_SECONDS));
  app.decorate('mailer', options.mailer ?? createMailer(config, app.log));
  app.decorate('leaderboardCache', await createLeaderboardCache(config, app.log));

  registerErrorHandling(app);

  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });
  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin)),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['content-type', 'authorization', 'x-csrf-token'],
  });
  await app.register(cookie);
  // Per-route limits (auth, runs) are declared via `config.rateLimit` on the routes;
  // they are inert when the plugin is not registered.
  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      errorResponseBuilder: (_req, ctx) =>
        Object.assign(new Error(`Rate limit exceeded, retry in ${ctx.after}`), { statusCode: 429 }),
    });
  }
  await app.register(authPlugin);

  if (config.SWAGGER_ENABLED) {
    await app.register(swagger, {
      openapi: {
        info: {
          title: 'TradeSim API',
          version: ENGINE_VERSION,
          description:
            'Educational trading game with fictional data. Errors: `{ error: { code, message } }`.',
        },
        components: {
          securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
        },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(oauthRoutes, { prefix: '/auth/oauth' });
  await app.register(userRoutes);
  await app.register(runRoutes, { prefix: '/runs' });
  await app.register(leaderboardRoutes);
  await app.register(friendRoutes, { prefix: '/friends' });
  await app.register(dailyRoutes, { prefix: '/daily' });
  await app.register(adminRoutes, { prefix: '/admin' });

  app.addHook('onClose', async () => {
    await app.leaderboardCache.close();
    if (!options.prisma) await prisma.$disconnect();
  });

  return app;
}
