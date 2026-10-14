import { describe, expect, it } from 'vitest';
import { createMarket } from '@trader-sim/engine';
import {
  migrateMarket,
  migratePortfolio,
  sanitizeMarket,
  sanitizePortfolio,
  sanitizeProgress,
  sanitizeSettings,
  SCHEMA_VERSIONS,
} from './migrations';
import { consumeCorruptedSaves, createSafeStorage, flushPendingWrites } from './safeStorage';

describe('portfolio migrations', () => {
  it('migrates a v1 save ({ cash, positions, history }) to the current schema', () => {
    const v1 = {
      cash: 5000,
      positions: [
        {
          id: 'p-7',
          assetId: 'NOVA',
          side: 'long',
          entryPrice: 100,
          quantity: 10,
          leverage: 2,
          margin: 500,
        },
      ],
      history: [
        {
          id: 't-3',
          assetId: 'BTCX',
          side: 'short',
          entryPrice: 1,
          exitPrice: 1,
          quantity: 1,
          margin: 10,
          pnl: 5,
        },
      ],
    };
    const migrated = migratePortfolio(v1, 1);
    expect(migrated).not.toBeNull();
    expect(migrated!.account.balance).toBe(5000);
    expect(migrated!.account.positions[0]!.openFee).toBeCloseTo(1); // 500 * 2 * 0.1%
    expect(migrated!.account.trades[0]!.reason).toBe('manual');
    expect(migrated!.account.seq).toBe(7); // continues after the highest existing id
    expect(migrated!.equityHistory).toEqual([]);
  });

  it('accepts current-version data unchanged', () => {
    const data = {
      account: { balance: 9000, positions: [], orders: [], trades: [], seq: 3 },
      equityHistory: [10_000, 9000],
      maxLeverageUsed: 5,
      maxOpenPositions: 2,
      bankrupt: false,
    };
    expect(migratePortfolio(data, SCHEMA_VERSIONS.portfolio)).toEqual(data);
  });

  it('migrates v2 saves to v3 (adds maxOpenPositions)', () => {
    const v2 = {
      account: { balance: 9000, positions: [], orders: [], trades: [], seq: 0 },
      equityHistory: [],
      maxLeverageUsed: 1,
      bankrupt: false,
    };
    expect(migratePortfolio(v2, 2)?.maxOpenPositions).toBe(0);
  });

  it('rejects saves from a newer app version', () => {
    expect(migratePortfolio({}, SCHEMA_VERSIONS.portfolio + 1)).toBeNull();
  });

  it('rejects garbage and repairs invalid fields', () => {
    expect(sanitizePortfolio(null)).toBeNull();
    expect(sanitizePortfolio('oops')).toBeNull();
    expect(sanitizePortfolio({ account: { balance: 'x' } })).toBeNull();

    const repaired = sanitizePortfolio({
      account: {
        balance: -50,
        positions: [{ id: 'bad' }, null, 42],
        orders: 'nope',
        trades: [{ id: 't-1', assetId: 'NOVA', side: 'sideways' }],
      },
      equityHistory: [1, 'two', Number.NaN, 3],
    });
    expect(repaired!.account.balance).toBe(0);
    expect(repaired!.account.positions).toEqual([]);
    expect(repaired!.account.orders).toEqual([]);
    expect(repaired!.account.trades).toEqual([]);
    expect(repaired!.equityHistory).toEqual([1, 3]);
  });
});

describe('market sanitizer', () => {
  it('round-trips a valid snapshot', () => {
    const market = createMarket(1, { now: 0, warmupCandles: 5 });
    const parsed = JSON.parse(JSON.stringify(market)) as unknown;
    expect(sanitizeMarket(parsed)).toEqual(market);
    expect(migrateMarket(parsed, SCHEMA_VERSIONS.market)).toEqual(market);
  });

  it('rejects snapshots with missing assets or broken prices', () => {
    const market = createMarket(1, { now: 0, warmupCandles: 5 });
    const { NOVA: _removed, ...rest } = market.assets;
    expect(sanitizeMarket({ ...market, assets: rest })).toBeNull();
    expect(
      sanitizeMarket({ ...market, assets: { ...market.assets, NOVA: { price: -1, candles: [] } } }),
    ).toBeNull();
    expect(sanitizeMarket({ ...market, tick: 'x' })).toBeNull();
  });
});

describe('settings & progress sanitizers', () => {
  it('falls back to defaults for unknown values', () => {
    const s = sanitizeSettings({
      theme: 'neon',
      speed: 3,
      volume: 9,
      selectedAssetId: 'NOPE',
      soundEnabled: 'yes',
    });
    expect(s).toMatchObject({
      theme: 'system',
      speed: 1,
      volume: 1,
      selectedAssetId: 'NOVA',
      soundEnabled: true,
    });
    expect(sanitizeSettings(undefined).theme).toBe('system');
  });

  it('sorts the leaderboard and drops unknown achievements', () => {
    const entry = (id: string, finalEquity: number) => ({
      id,
      date: 1,
      finalEquity,
      returnPct: 0,
      trades: 1,
      winRate: 0,
    });
    const p = sanitizeProgress({
      xp: -5,
      unlocked: { firstTrade: 123, madeUp: 1 },
      leaderboard: [entry('a', 1), entry('b', 3), { broken: true }, entry('c', 2)],
    });
    expect(p.xp).toBe(0);
    expect(p.unlocked).toEqual({ firstTrade: 123 });
    expect(p.leaderboard.map((e) => e.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('safe storage', () => {
  it('drops a corrupted save instead of crashing', () => {
    localStorage.setItem('trader-sim:test', '{not json');
    const storage = createSafeStorage<unknown>();
    expect(storage.getItem('trader-sim:test')).toBeNull();
    expect(localStorage.getItem('trader-sim:test')).toBeNull();
    expect(consumeCorruptedSaves()).toContain('trader-sim:test');
    expect(consumeCorruptedSaves()).toEqual([]);
  });

  it('treats JSON without a state field as corrupted', () => {
    localStorage.setItem('trader-sim:test', '[1,2,3]');
    expect(createSafeStorage<unknown>().getItem('trader-sim:test')).toBeNull();
    consumeCorruptedSaves();
  });

  it('throttles writes until flushed', () => {
    const storage = createSafeStorage<{ a: number }>({ throttleMs: 10_000 });
    void storage.setItem('trader-sim:throttled', { state: { a: 1 }, version: 1 });
    expect(localStorage.getItem('trader-sim:throttled')).toBeNull();
    flushPendingWrites();
    expect(JSON.parse(localStorage.getItem('trader-sim:throttled')!)).toEqual({
      state: { a: 1 },
      version: 1,
    });
  });
});
