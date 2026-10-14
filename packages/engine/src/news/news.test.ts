import { describe, expect, it } from 'vitest';
import type { NewsEvent } from '../types';
import { SeededRandom } from '../random';
import { ASSETS } from '../market/assets';
import { decayNews, generateNews, NEWS_DRIFT_FACTOR, newsDrift, newsShock } from './newsEngine';
import { templatesFor } from './templates';

const news = (overrides: Partial<NewsEvent> = {}): NewsEvent => ({
  id: 'n-1',
  assetId: 'NOVA',
  templateId: 'productLaunch',
  sentiment: 'positive',
  strength: 1,
  duration: 10,
  remaining: 10,
  tick: 0,
  time: 0,
  params: {},
  ...overrides,
});

describe('news effects', () => {
  it('positive news adds drift, negative subtracts, other assets unaffected', () => {
    expect(newsDrift([news()], 'NOVA', 0.01)).toBeCloseTo(0.01 * NEWS_DRIFT_FACTOR);
    expect(newsDrift([news({ sentiment: 'negative' })], 'NOVA', 0.01)).toBeLessThan(0);
    expect(newsDrift([news()], 'BTCX', 0.01)).toBe(0);
  });

  it('effect fades as the news ages', () => {
    const fresh = newsDrift([news()], 'NOVA', 0.01);
    const old = newsDrift([news({ remaining: 2 })], 'NOVA', 0.01);
    expect(old).toBeCloseTo(fresh * 0.2);
  });

  it('shock sign follows sentiment', () => {
    expect(newsShock(news(), 0.01)).toBeGreaterThan(0);
    expect(newsShock(news({ sentiment: 'negative' }), 0.01)).toBeLessThan(0);
  });

  it('expired news is removed', () => {
    const decayed = decayNews([news({ remaining: 1 }), news({ id: 'n-2', remaining: 5 })]);
    expect(decayed.map((n) => n.id)).toEqual(['n-2']);
    expect(decayed[0]!.remaining).toBe(4);
  });

  it('guards against zero duration', () => {
    expect(newsDrift([news({ duration: 0 })], 'NOVA', 0.01)).toBe(0);
  });
});

describe('news generation', () => {
  it('is deterministic and picks a template valid for the asset category', () => {
    const a = generateNews(new SeededRandom(5), ASSETS, { tick: 1, time: 0, seq: 1 });
    const b = generateNews(new SeededRandom(5), ASSETS, { tick: 1, time: 0, seq: 1 });
    expect(a).toEqual(b);
    const asset = ASSETS.find((x) => x.id === a!.assetId)!;
    expect(templatesFor(asset.category).map((t) => t.id)).toContain(a!.templateId);
    expect(a!.strength).toBeGreaterThan(0);
    expect(a!.strength).toBeLessThanOrEqual(1);
  });

  it('every category has at least one positive and one negative template', () => {
    for (const asset of ASSETS) {
      const sentiments = new Set(templatesFor(asset.category).map((t) => t.sentiment));
      expect(sentiments).toEqual(new Set(['positive', 'negative']));
    }
  });

  it('returns null for an empty asset list', () => {
    expect(generateNews(new SeededRandom(1), [], { tick: 0, time: 0, seq: 1 })).toBeNull();
  });
});
