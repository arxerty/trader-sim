import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { randomToken, safeEqual } from '../lib/crypto';
import { forbidden, unauthorized } from '../lib/errors';

export const REFRESH_COOKIE = 'ts_refresh';
export const CSRF_COOKIE = 'ts_csrf';
export const CSRF_HEADER = 'x-csrf-token';

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

/**
 * Access tokens travel in the Authorization header (kept in memory by the web
 * app); refresh tokens live in an httpOnly cookie scoped to the auth routes.
 */
export const authPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('auth', null);

  app.decorate('authenticate', async (request: FastifyRequest) => {
    const token = bearer(request);
    if (!token) throw unauthorized('UNAUTHORIZED', 'Missing access token');
    const claims = await app.jwt.verify(token);
    request.auth = { id: claims.sub, nickname: claims.nick };
  });

  app.decorate('optionalAuth', async (request: FastifyRequest) => {
    const token = bearer(request);
    if (!token) return;
    try {
      const claims = await app.jwt.verify(token);
      request.auth = { id: claims.sub, nickname: claims.nick };
    } catch {
      request.auth = null;
    }
  });
});

export function refreshCookiePath(app: FastifyInstance): string {
  return `${app.config.COOKIE_PATH_PREFIX}/auth`;
}

/** Sets the rotated refresh token plus a readable double-submit CSRF token. */
export function setSessionCookies(
  app: FastifyInstance,
  reply: FastifyReply,
  refreshToken: string,
): void {
  const secure = app.config.cookieSecure;
  const maxAge = app.config.REFRESH_TOKEN_TTL_DAYS * 24 * 3600;
  reply.setCookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: refreshCookiePath(app),
    maxAge,
  });
  reply.setCookie(CSRF_COOKIE, randomToken(18), {
    httpOnly: false,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge,
  });
}

export function clearSessionCookies(app: FastifyInstance, reply: FastifyReply): void {
  reply.clearCookie(REFRESH_COOKIE, { path: refreshCookiePath(app) });
  reply.clearCookie(CSRF_COOKIE, { path: '/' });
}

/**
 * CSRF protection for endpoints authenticated by cookie (refresh/logout):
 * the request must echo the CSRF cookie in a header, which a cross-site page
 * cannot read. SameSite=Lax is the second line of defence.
 */
export function assertCsrf(request: FastifyRequest): void {
  const cookie = request.cookies[CSRF_COOKIE];
  const header = request.headers[CSRF_HEADER];
  if (!cookie || typeof header !== 'string' || !safeEqual(cookie, header)) {
    throw forbidden('CSRF_INVALID', 'Missing or invalid CSRF token');
  }
}
