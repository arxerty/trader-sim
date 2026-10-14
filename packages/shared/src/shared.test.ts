import { describe, expect, it } from 'vitest';
import { checkNickname } from './nickname';
import { dayKey, isoWeekKey, seasonBounds, seasonKey } from './periods';
import { gameActionSchema, finishRunBodySchema } from './schemas/runs';
import { registerBodySchema } from './schemas/auth';
import { isApiErrorBody } from './errors';

describe('nickname rules', () => {
  it('accepts valid nicknames and rejects bad ones', () => {
    expect(checkNickname('Trader_42')).toBeNull();
    expect(checkNickname('ab')).toBe('NICKNAME_INVALID');
    expect(checkNickname('a'.repeat(21))).toBe('NICKNAME_INVALID');
    expect(checkNickname('bad name')).toBe('NICKNAME_INVALID');
    expect(checkNickname('SuperAdmin')).toBe('NICKNAME_FORBIDDEN');
    expect(checkNickname('4dm1n_x')).toBe('NICKNAME_FORBIDDEN');
  });
});

describe('period keys', () => {
  it('uses UTC and ISO weeks', () => {
    const d = new Date(Date.UTC(2026, 9, 14, 23, 30));
    expect(dayKey(d)).toBe('2026-10-14');
    expect(seasonKey(d)).toBe('2026-10');
    expect(isoWeekKey(d)).toBe('2026-W42');
    expect(isoWeekKey(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53');
    expect(seasonBounds('2026-12').endsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });
});

describe('schemas', () => {
  it('validates game actions', () => {
    expect(gameActionSchema.safeParse({ tick: 600, type: 'pause' }).success).toBe(true);
    expect(
      gameActionSchema.safeParse({
        tick: 600,
        type: 'placeOrder',
        payload: { assetId: 'NOVA', side: 'long', type: 'market', margin: 100, leverage: 3 },
      }).success,
    ).toBe(false);
    expect(gameActionSchema.safeParse({ tick: -1, type: 'pause' }).success).toBe(false);
    expect(gameActionSchema.safeParse({ tick: 1, type: 'hack' }).success).toBe(false);
  });

  it('normalises email and applies defaults', () => {
    const parsed = registerBodySchema.parse({
      email: ' A@B.io ',
      password: 'secret123',
      nickname: 'abc',
    });
    expect(parsed.email).toBe('a@b.io');
    expect(
      finishRunBodySchema.parse({
        finalTick: 1,
        engineVersion: 'x',
        clientSummary: { finalEquity: 1 },
      }).actions,
    ).toEqual([]);
  });

  it('recognises API error bodies', () => {
    expect(isApiErrorBody({ error: { code: 'RATE_LIMITED', message: 'x' } })).toBe(true);
    expect(isApiErrorBody({ error: { code: 'NOPE', message: 'x' } })).toBe(false);
  });
});
