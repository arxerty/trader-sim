import type { AssetDefinition, NewsEvent, NewsParams } from '../types';
import type { SeededRandom } from '../random';
import { roundTo } from '../math';
import { templatesFor } from './templates';

/** Chance of a news item on each tick. */
export const NEWS_PROBABILITY = 0.025;
/** Extra drift per tick at full strength, in units of the asset's sigma. */
export const NEWS_DRIFT_FACTOR = 0.35;
/** Immediate price shock at full strength, in units of the asset's sigma. */
export const NEWS_SHOCK_FACTOR = 2.5;
export const NEWS_LOG_LIMIT = 50;

export interface NewsContext {
  tick: number;
  time: number;
  seq: number;
}

export function generateNews(
  rng: SeededRandom,
  assets: readonly AssetDefinition[],
  ctx: NewsContext,
): NewsEvent | null {
  if (assets.length === 0) return null;
  const asset = rng.pick(assets);
  const candidates = templatesFor(asset.category);
  if (candidates.length === 0) return null;
  const template = rng.pick(candidates);

  const params: NewsParams = {};
  if (template.count) params.count = rng.int(template.count[0], template.count[1]);
  if (template.percent)
    params.percent = roundTo(rng.range(template.percent[0], template.percent[1]), 2);

  const duration = rng.int(template.duration[0], template.duration[1]);
  return {
    id: `n-${ctx.seq}`,
    assetId: asset.id,
    templateId: template.id,
    sentiment: template.sentiment,
    strength: roundTo(rng.range(template.strength[0], template.strength[1]), 3),
    duration,
    remaining: duration,
    tick: ctx.tick,
    time: ctx.time,
    params,
  };
}

export function maybeGenerateNews(
  rng: SeededRandom,
  assets: readonly AssetDefinition[],
  ctx: NewsContext,
  probability = NEWS_PROBABILITY,
): NewsEvent | null {
  return rng.chance(probability) ? generateNews(rng, assets, ctx) : null;
}

const sign = (news: NewsEvent): 1 | -1 => (news.sentiment === 'positive' ? 1 : -1);

/** Additional drift for an asset from all active news; the effect fades linearly. */
export function newsDrift(active: readonly NewsEvent[], assetId: string, sigma: number): number {
  let drift = 0;
  for (const news of active) {
    if (news.assetId !== assetId || news.duration <= 0) continue;
    const fade = Math.max(0, news.remaining) / news.duration;
    drift += sign(news) * news.strength * sigma * NEWS_DRIFT_FACTOR * fade;
  }
  return drift;
}

/** Log-return applied once when the news is published. */
export function newsShock(news: NewsEvent, sigma: number): number {
  return sign(news) * news.strength * sigma * NEWS_SHOCK_FACTOR;
}

export function decayNews(active: readonly NewsEvent[]): NewsEvent[] {
  return active.map((n) => ({ ...n, remaining: n.remaining - 1 })).filter((n) => n.remaining > 0);
}
