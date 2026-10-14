import { z } from 'zod';
import type { OAuthProvider } from '@trader-sim/shared';
import { checkNickname } from '@trader-sim/shared';
import type { Config } from '../../config';
import type { App } from '../../types';
import { randomToken, safeEqual } from '../../lib/crypto';
import { badRequest, notFound } from '../../lib/errors';
import { setSessionCookies } from '../../plugins/auth';
import { AuthService } from './service';

/**
 * Optional Google / GitHub sign-in (authorization-code flow). A provider is
 * enabled only when its client id + secret are configured.
 */
interface ProviderDef {
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  clientId: (c: Config) => string | undefined;
  clientSecret: (c: Config) => string | undefined;
  fetchProfile: (accessToken: string) => Promise<ExternalProfile>;
}

interface ExternalProfile {
  id: string;
  email: string | null;
  emailVerified: boolean;
  name: string;
  avatar: string | null;
}

async function getJson<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/json',
      'user-agent': 'TradeSim',
    },
  });
  if (!res.ok) throw badRequest('TOKEN_INVALID', `Provider request failed (${res.status})`);
  return (await res.json()) as T;
}

const PROVIDERS: Record<OAuthProvider, ProviderDef> = {
  google: {
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    clientId: (c) => c.GOOGLE_CLIENT_ID,
    clientSecret: (c) => c.GOOGLE_CLIENT_SECRET,
    async fetchProfile(token) {
      const p = await getJson<{
        sub: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      }>('https://openidconnect.googleapis.com/v1/userinfo', token);
      return {
        id: p.sub,
        email: p.email ?? null,
        emailVerified: p.email_verified === true,
        name: p.name ?? 'player',
        avatar: p.picture ?? null,
      };
    },
  },
  github: {
    authorizeUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
    clientId: (c) => c.GITHUB_CLIENT_ID,
    clientSecret: (c) => c.GITHUB_CLIENT_SECRET,
    async fetchProfile(token) {
      const user = await getJson<{ id: number; login: string; avatar_url?: string }>(
        'https://api.github.com/user',
        token,
      );
      const emails = await getJson<Array<{ email: string; primary: boolean; verified: boolean }>>(
        'https://api.github.com/user/emails',
        token,
      );
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.verified);
      return {
        id: String(user.id),
        email: primary?.email ?? null,
        emailVerified: Boolean(primary),
        name: user.login,
        avatar: user.avatar_url ?? null,
      };
    },
  },
};

export function enabledProviders(config: Config): OAuthProvider[] {
  return (Object.keys(PROVIDERS) as OAuthProvider[]).filter(
    (p) => PROVIDERS[p].clientId(config) && PROVIDERS[p].clientSecret(config),
  );
}

const STATE_COOKIE = 'ts_oauth_state';
const paramsSchema = z.object({ provider: z.enum(['google', 'github']) });

export async function oauthRoutes(app: App): Promise<void> {
  const auth = new AuthService(app);
  const redirectUri = (p: OAuthProvider) => `${app.config.API_PUBLIC_URL}/auth/oauth/${p}/callback`;
  const cookiePath = `${app.config.COOKIE_PATH_PREFIX}/auth/oauth`;

  const providerOrThrow = (p: OAuthProvider) => {
    if (!enabledProviders(app.config).includes(p))
      throw notFound('PROVIDER_DISABLED', 'Provider is not enabled');
    return PROVIDERS[p];
  };

  app.get(
    '/:provider/start',
    { schema: { tags: ['auth'], params: paramsSchema } },
    async (req, reply) => {
      const def = providerOrThrow(req.params.provider);
      const state = randomToken(18);
      reply.setCookie(STATE_COOKIE, state, {
        httpOnly: true,
        secure: app.config.cookieSecure,
        sameSite: 'lax',
        path: cookiePath,
        maxAge: 600,
      });
      const url = new URL(def.authorizeUrl);
      url.searchParams.set('client_id', def.clientId(app.config) ?? '');
      url.searchParams.set('redirect_uri', redirectUri(req.params.provider));
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', def.scope);
      url.searchParams.set('state', state);
      return reply.redirect(url.toString());
    },
  );

  app.get(
    '/:provider/callback',
    {
      schema: {
        tags: ['auth'],
        params: paramsSchema,
        querystring: z.object({ code: z.string().max(2048), state: z.string().max(256) }),
      },
    },
    async (req, reply) => {
      const provider = req.params.provider;
      const def = providerOrThrow(provider);
      const expected = req.cookies[STATE_COOKIE];
      reply.clearCookie(STATE_COOKIE, { path: cookiePath });
      if (!expected || !safeEqual(expected, req.query.state))
        throw badRequest('CSRF_INVALID', 'OAuth state mismatch');

      const tokenRes = await fetch(def.tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          accept: 'application/json',
        },
        body: new URLSearchParams({
          client_id: def.clientId(app.config) ?? '',
          client_secret: def.clientSecret(app.config) ?? '',
          code: req.query.code,
          redirect_uri: redirectUri(provider),
          grant_type: 'authorization_code',
        }),
      });
      const token = (await tokenRes.json()) as { access_token?: string };
      if (!token.access_token) throw badRequest('TOKEN_INVALID', 'OAuth code exchange failed');
      const profile = await def.fetchProfile(token.access_token);
      if (!profile.email || !profile.emailVerified)
        throw badRequest('TOKEN_INVALID', 'Provider did not return a verified e-mail');

      const user = await findOrCreateOAuthUser(app, provider, profile);
      const session = await auth.issueSession(user, {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
      setSessionCookies(app, reply, session.refreshToken);
      return reply.redirect(`${app.config.WEB_URL}/?oauth=success`);
    },
  );
}

async function findOrCreateOAuthUser(app: App, provider: OAuthProvider, profile: ExternalProfile) {
  const db = app.prisma;
  const linked = await db.oAuthAccount.findUnique({
    where: { provider_providerUserId: { provider, providerUserId: profile.id } },
    include: { user: true },
  });
  if (linked) return linked.user;

  const email = (profile.email ?? '').toLowerCase();
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    await db.oAuthAccount.create({
      data: { provider, providerUserId: profile.id, userId: existing.id },
    });
    return existing.emailVerified
      ? existing
      : db.user.update({ where: { id: existing.id }, data: { emailVerified: true } });
  }

  const base = profile.name.replace(/[^A-Za-z0-9_]/g, '').slice(0, 14) || 'trader';
  let nickname =
    base.length >= 3 && !checkNickname(base)
      ? base
      : `trader_${randomToken(3).replace(/[^A-Za-z0-9]/g, '')}`;
  while (await db.user.findUnique({ where: { nicknameLower: nickname.toLowerCase() } })) {
    nickname = `${base.slice(0, 12)}_${Math.floor(Math.random() * 10_000)}`;
  }
  return db.user.create({
    data: {
      email,
      emailVerified: true,
      nickname,
      nicknameLower: nickname.toLowerCase(),
      avatar: profile.avatar,
      profile: { create: {} },
      oauthAccounts: { create: { provider, providerUserId: profile.id } },
    },
  });
}
