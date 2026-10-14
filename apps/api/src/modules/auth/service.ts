import type { Prisma, User } from '@prisma/client';
import { ACHIEVEMENTS, levelForXp } from '@trader-sim/engine';
import { checkNickname, type GuestProgress } from '@trader-sim/shared';
import type { App } from '../../types';
import {
  dummyPasswordHash,
  hashPassword,
  randomToken,
  sha256,
  verifyPassword,
} from '../../lib/crypto';
import { badRequest, conflict, unauthorized } from '../../lib/errors';

const EMAIL_TOKEN_TTL_MS = { VERIFY_EMAIL: 48 * 3600_000, RESET_PASSWORD: 3600_000 } as const;
/** Guest progress cannot be verified, so imported XP is capped. */
export const GUEST_XP_IMPORT_CAP = 500;
/** Reuse of a just-rotated refresh token within this window is treated as a race (e.g. two tabs). */
export const REFRESH_REUSE_GRACE_MS = 30_000;

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export class AuthService {
  constructor(private readonly app: App) {}

  private get db() {
    return this.app.prisma;
  }

  private now() {
    return this.app.clock.now();
  }

  async assertNicknameAvailable(nickname: string, exceptUserId?: string): Promise<void> {
    const problem = checkNickname(nickname);
    if (problem) throw badRequest(problem, 'Nickname is not allowed');
    const existing = await this.db.user.findUnique({
      where: { nicknameLower: nickname.toLowerCase() },
    });
    if (existing && existing.id !== exceptUserId)
      throw conflict('NICKNAME_TAKEN', 'Nickname is already taken');
  }

  async register(
    input: {
      email: string;
      password: string;
      nickname: string;
      locale?: string;
      guestProgress?: GuestProgress;
    },
    meta: ClientMeta,
  ): Promise<IssuedSession> {
    await this.assertNicknameAvailable(input.nickname);
    if (await this.db.user.findUnique({ where: { email: input.email } })) {
      throw conflict('EMAIL_TAKEN', 'E-mail is already registered');
    }
    const passwordHash = await hashPassword(input.password);
    const user = await this.db.user.create({
      data: {
        email: input.email,
        passwordHash,
        nickname: input.nickname,
        nicknameLower: input.nickname.toLowerCase(),
        locale: input.locale ?? 'en',
        profile: { create: {} },
      },
    });
    if (input.guestProgress) await this.importGuestProgress(user.id, input.guestProgress);
    await this.sendVerification(user);
    return this.issueSession(user, meta);
  }

  /** Links local guest progress to the account (XP capped, achievements marked as imported). */
  async importGuestProgress(
    userId: string,
    progress: GuestProgress,
  ): Promise<{ xp: number; achievements: number }> {
    const known = new Set(ACHIEVEMENTS.map((a) => a.id as string));
    const ids = [...new Set(progress.achievements)].filter((id) => known.has(id));
    return this.db.$transaction(async (tx) => {
      const profile = await tx.profile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      });
      const room = Math.max(0, GUEST_XP_IMPORT_CAP - profile.importedXp);
      const xp = Math.min(room, progress.xp);
      const created = await tx.userAchievement.createMany({
        data: ids.map((achievementId) => ({ userId, achievementId, imported: true })),
        skipDuplicates: true,
      });
      const newXp = profile.xp + xp;
      await tx.profile.update({
        where: { userId },
        data: { xp: newXp, importedXp: profile.importedXp + xp, level: levelForXp(newXp).level },
      });
      return { xp, achievements: created.count };
    });
  }

  async login(email: string, password: string, meta: ClientMeta): Promise<IssuedSession> {
    const user = await this.db.user.findUnique({ where: { email } });
    // Always run argon2 so response time does not reveal whether the e-mail exists.
    const ok = await verifyPassword(user?.passwordHash ?? (await dummyPasswordHash()), password);
    if (!user || !user.passwordHash || !ok)
      throw unauthorized('INVALID_CREDENTIALS', 'Invalid e-mail or password');
    return this.issueSession(user, meta);
  }

  async issueSession(
    user: User,
    meta: ClientMeta,
    family = randomToken(12),
  ): Promise<IssuedSession> {
    const refreshToken = randomToken(32);
    await this.db.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        family,
        expiresAt: new Date(
          this.now().getTime() + this.app.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000,
        ),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 255) ?? null,
      },
    });
    const accessToken = await this.app.jwt.sign({ sub: user.id, nick: user.nickname });
    return { accessToken, refreshToken, user };
  }

  /**
   * Rotates a refresh token. Presenting an already rotated (revoked) token is
   * treated as theft: the entire token family is revoked.
   */
  async refresh(rawToken: string | undefined, meta: ClientMeta): Promise<IssuedSession> {
    if (!rawToken) throw unauthorized('TOKEN_INVALID', 'Missing refresh token');
    const stored = await this.db.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { user: true },
    });
    if (!stored) throw unauthorized('TOKEN_INVALID', 'Unknown refresh token');
    const now = this.now();
    if (stored.revokedAt) {
      // Two tabs refreshing at the same moment present the same token; a just-rotated
      // token reused within the grace window is a race, not theft – reject without revoking.
      const sinceRotation = now.getTime() - stored.revokedAt.getTime();
      if (stored.replacedBy && sinceRotation < REFRESH_REUSE_GRACE_MS) {
        throw unauthorized('TOKEN_INVALID', 'Refresh token was just rotated');
      }
      await this.db.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: now },
      });
      this.app.log.warn(
        { userId: stored.userId, family: stored.family },
        'refresh token reuse detected – family revoked',
      );
      throw unauthorized('TOKEN_INVALID', 'Refresh token has been revoked');
    }
    if (stored.expiresAt <= now) throw unauthorized('TOKEN_EXPIRED', 'Refresh token expired');

    const session = await this.issueSession(stored.user, meta, stored.family);
    // Conditional update guards against two concurrent refreshes with the same token.
    const revoked = await this.db.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: now, replacedBy: sha256(session.refreshToken) },
    });
    if (revoked.count === 0) {
      await this.db.refreshToken.updateMany({
        where: { family: stored.family, revokedAt: null },
        data: { revokedAt: now },
      });
      throw unauthorized('TOKEN_INVALID', 'Refresh token has been revoked');
    }
    return session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.db.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  async logoutAll(userId: string): Promise<number> {
    const res = await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.now() },
    });
    return res.count;
  }

  private async createEmailToken(
    userId: string,
    type: keyof typeof EMAIL_TOKEN_TTL_MS,
  ): Promise<string> {
    const token = randomToken(32);
    await this.db.emailToken.create({
      data: {
        userId,
        type,
        tokenHash: sha256(token),
        expiresAt: new Date(this.now().getTime() + EMAIL_TOKEN_TTL_MS[type]),
      },
    });
    return token;
  }

  async sendVerification(user: User): Promise<void> {
    if (user.emailVerified) return;
    const token = await this.createEmailToken(user.id, 'VERIFY_EMAIL');
    const link = `${this.app.config.WEB_URL}/?verify=${encodeURIComponent(token)}`;
    await this.app.mailer.send({
      to: user.email,
      subject: 'TradeSim: confirm your e-mail',
      text: `Hi ${user.nickname}!\n\nConfirm your e-mail address: ${link}\n\nThe link is valid for 48 hours.`,
    });
  }

  private async consumeEmailToken(token: string, type: keyof typeof EMAIL_TOKEN_TTL_MS) {
    const stored = await this.db.emailToken.findUnique({ where: { tokenHash: sha256(token) } });
    if (!stored || stored.type !== type || stored.usedAt)
      throw badRequest('TOKEN_INVALID', 'Invalid or used link');
    if (stored.expiresAt <= this.now()) throw badRequest('TOKEN_EXPIRED', 'The link has expired');
    const used = await this.db.emailToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: this.now() },
    });
    if (used.count === 0) throw badRequest('TOKEN_INVALID', 'Invalid or used link');
    return stored;
  }

  async verifyEmail(token: string): Promise<User> {
    const stored = await this.consumeEmailToken(token, 'VERIFY_EMAIL');
    return this.db.user.update({ where: { id: stored.userId }, data: { emailVerified: true } });
  }

  /** Always succeeds from the caller's perspective, so it cannot be used to probe e-mails. */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.db.user.findUnique({ where: { email } });
    if (!user) return;
    const token = await this.createEmailToken(user.id, 'RESET_PASSWORD');
    const link = `${this.app.config.WEB_URL}/?reset=${encodeURIComponent(token)}`;
    await this.app.mailer.send({
      to: user.email,
      subject: 'TradeSim: reset your password',
      text: `Someone (hopefully you) asked to reset the password.\n\nSet a new password: ${link}\n\nThe link is valid for 1 hour. If it wasn't you, ignore this e-mail.`,
    });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const stored = await this.consumeEmailToken(token, 'RESET_PASSWORD');
    const passwordHash = await hashPassword(password);
    const data: Prisma.UserUpdateInput = { passwordHash, emailVerified: true };
    await this.db.user.update({ where: { id: stored.userId }, data });
    await this.logoutAll(stored.userId);
  }
}
