import { describe, expect, it } from 'vitest';
import type { AssetDefinition } from '@/types';
import { SeededRandom } from '@/shared/lib/random';
import { ASSETS } from './assets';
import { applyPriceToCandles } from './candles';
import { applyJump, gbmStep } from './gbm';
import { advanceMarket, createMarket, pricesOf, WARMUP_CANDLES } from './simulation';

const NOW = Date.UTC(2025, 0, 1, 12, 0, 0);

describe('SeededRandom', () => {
  it('is reproducible for the same seed', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('differs across seeds and can resume from its state', () => {
    const a = new SeededRandom(1);
    expect(a.next()).not.toBe(new SeededRandom(2).next());
    const resumed = new SeededRandom(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('produces roughly standard normal values', () => {
    const rng = new SeededRandom(7);
    const xs = Array.from({ length: 20_000 }, () => rng.normal());
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const variance = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(variance).toBeGreaterThan(0.95);
    expect(variance).toBeLessThan(1.05);
  });
});

describe('GBM', () => {
  it('is deterministic for a given shock', () => {
    expect(gbmStep(100, 0, 0, 0)).toBe(100);
    expect(gbmStep(100, 0.01, 0, 0)).toBeCloseTo(100 * Math.exp(0.01));
    expect(gbmStep(100, 0, 0.02, 1)).toBeCloseTo(100 * Math.exp(-0.0002 + 0.02));
  });

  it('jumps are symmetric in log space', () => {
    const up = applyJump(100, 0.1, 1);
    expect(up).toBeCloseTo(110);
    expect(applyJump(up, 0.1, -1)).toBeCloseTo(100);
  });
});

describe('candles', () => {
  it('opens, updates and rolls candles', () => {
    let candles = applyPriceToCandles([], 100, 60);
    expect(candles).toEqual([{ time: 60, open: 100, high: 100, low: 100, close: 100 }]);
    candles = applyPriceToCandles(candles, 105, 60);
    candles = applyPriceToCandles(candles, 98, 60);
    expect(candles).toEqual([{ time: 60, open: 100, high: 105, low: 98, close: 98 }]);
    candles = applyPriceToCandles(candles, 99, 120);
    expect(candles[1]).toEqual({ time: 120, open: 98, high: 99, low: 98, close: 99 });
  });

  it('caps the series length and ignores out-of-order data', () => {
    let candles = applyPriceToCandles([], 1, 0, 3);
    for (let i = 1; i < 10; i++) candles = applyPriceToCandles(candles, i, i * 60, 3);
    expect(candles).toHaveLength(3);
    expect(candles.map((c) => c.time)).toEqual([420, 480, 540]);
    expect(applyPriceToCandles(candles, 5, 0, 3)).toEqual(candles);
  });
});

describe('market simulation', () => {
  it('produces identical markets for the same seed', () => {
    expect(createMarket(123, { now: NOW })).toEqual(createMarket(123, { now: NOW }));
  });

  it('produces different markets for different seeds', () => {
    expect(pricesOf(createMarket(1, { now: NOW }))).not.toEqual(
      pricesOf(createMarket(2, { now: NOW })),
    );
  });

  it('builds warm-up history with strictly increasing candle times', () => {
    const market = createMarket(5, { now: NOW });
    for (const asset of ASSETS) {
      const candles = market.assets[asset.id]!.candles;
      expect(candles).toHaveLength(WARMUP_CANDLES);
      for (let i = 1; i < candles.length; i++)
        expect(candles[i]!.time).toBeGreaterThan(candles[i - 1]!.time);
      expect(market.assets[asset.id]!.sessionOpen).toBe(market.assets[asset.id]!.price);
    }
  });

  it('replays identically from a snapshot and does not mutate it', () => {
    const start = createMarket(99, { now: NOW });
    const frozen = JSON.stringify(start);
    const run = () => {
      let s = start;
      const news: string[] = [];
      for (let i = 0; i < 300; i++) {
        const step = advanceMarket(s);
        if (step.news) news.push(step.news.templateId);
        s = step.snapshot;
      }
      return { prices: pricesOf(s), news, tick: s.tick };
    };
    expect(run()).toEqual(run());
    expect(JSON.stringify(start)).toBe(frozen);
  });

  it('keeps prices positive and finite over a long run', () => {
    let s = createMarket(2024, { now: NOW });
    for (let i = 0; i < 3000; i++) s = advanceMarket(s).snapshot;
    for (const price of Object.values(pricesOf(s))) {
      expect(Number.isFinite(price)).toBe(true);
      expect(price).toBeGreaterThan(0);
    }
  });

  it('reports jumps', () => {
    const jumpy: AssetDefinition = { ...ASSETS[0]!, id: 'JMP', jumpProbability: 1, jumpScale: 0.1 };
    const market = createMarket(1, { now: NOW, assets: [jumpy], warmupCandles: 1 });
    const { jumps } = advanceMarket(market, [jumpy], { newsEnabled: false });
    expect(jumps).toHaveLength(1);
    expect(Math.abs(jumps[0]!.change)).toBeGreaterThan(0.04);
  });
});
