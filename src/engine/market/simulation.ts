import type { AssetDefinition, AssetId, AssetRuntime, MarketSnapshot, NewsEvent } from '@/types';
import { SeededRandom, normalizeSeed } from '@/shared/lib/random';
import { decayNews, maybeGenerateNews, newsDrift, newsShock, NEWS_LOG_LIMIT } from '../news';
import { ASSETS } from './assets';
import { applyJump, gbmStep } from './gbm';
import {
  applyPriceToCandles,
  CANDLE_SECONDS,
  candleTimeForTick,
  tickTime,
  TICKS_PER_CANDLE,
} from './candles';

/** Trend regime parameters: a random extra drift that lasts a random number of ticks. */
const TREND_STRENGTH = 0.06;
const TREND_MIN_TICKS = 40;
const TREND_MAX_TICKS = 160;
/** Lower bound on price relative to the initial price, protects against degenerate values. */
const MIN_PRICE_FACTOR = 0.001;

export const WARMUP_CANDLES = 120;

export interface PriceJump {
  assetId: AssetId;
  /** Signed relative change, e.g. -0.07 for a 7% drop. */
  change: number;
}

export interface MarketStepResult {
  snapshot: MarketSnapshot;
  news: NewsEvent | null;
  jumps: PriceJump[];
}

export interface StepOptions {
  newsEnabled?: boolean;
  newsProbability?: number;
}

function newTrend(
  rng: SeededRandom,
  sigma: number,
): Pick<AssetRuntime, 'trend' | 'trendTicksLeft'> {
  return {
    trend: rng.normal() * sigma * TREND_STRENGTH,
    trendTicksLeft: rng.int(TREND_MIN_TICKS, TREND_MAX_TICKS),
  };
}

/**
 * Advances the market by one tick. Pure: the same snapshot always produces the
 * same result because the RNG state is part of the snapshot.
 */
export function advanceMarket(
  snapshot: MarketSnapshot,
  assets: readonly AssetDefinition[] = ASSETS,
  options: StepOptions = {},
): MarketStepResult {
  const rng = new SeededRandom(snapshot.rngState);
  const tick = snapshot.tick + 1;
  const time = tickTime(snapshot.startTime, tick);
  const candleTime = candleTimeForTick(snapshot.startTime, tick);

  let activeNews = decayNews(snapshot.activeNews);
  let newsSeq = snapshot.newsSeq;
  let newsLog = snapshot.newsLog;
  let published: NewsEvent | null = null;

  if (options.newsEnabled !== false) {
    published = maybeGenerateNews(
      rng,
      assets,
      { tick, time, seq: newsSeq + 1 },
      options.newsProbability,
    );
    if (published) {
      newsSeq += 1;
      activeNews = [...activeNews, published];
      newsLog = [published, ...newsLog].slice(0, NEWS_LOG_LIMIT);
    }
  }

  const jumps: PriceJump[] = [];
  const nextAssets: Record<AssetId, AssetRuntime> = {};

  for (const def of assets) {
    const current = snapshot.assets[def.id] ?? initialRuntime(def, rng);
    let { trend, trendTicksLeft } = current;
    trendTicksLeft -= 1;
    if (trendTicksLeft <= 0) ({ trend, trendTicksLeft } = newTrend(rng, def.volatility));

    const mu = def.drift + trend + newsDrift(activeNews, def.id, def.volatility);
    let price = gbmStep(current.price, mu, def.volatility, rng.normal());

    if (published && published.assetId === def.id) {
      price *= Math.exp(newsShock(published, def.volatility));
    }

    if (rng.chance(def.jumpProbability)) {
      const direction: 1 | -1 = rng.next() < 0.5 ? -1 : 1;
      const magnitude = def.jumpScale * rng.range(0.5, 1.5);
      const before = price;
      price = applyJump(price, magnitude, direction);
      jumps.push({ assetId: def.id, change: price / before - 1 });
    }

    price = Math.max(price, def.initialPrice * MIN_PRICE_FACTOR);

    nextAssets[def.id] = {
      price,
      sessionOpen: current.sessionOpen,
      trend,
      trendTicksLeft,
      candles: applyPriceToCandles(current.candles, price, candleTime),
    };
  }

  return {
    snapshot: {
      ...snapshot,
      tick,
      rngState: rng.state,
      assets: nextAssets,
      activeNews,
      newsLog,
      newsSeq,
    },
    news: published,
    jumps,
  };
}

function initialRuntime(def: AssetDefinition, rng: SeededRandom): AssetRuntime {
  return {
    price: def.initialPrice,
    sessionOpen: def.initialPrice,
    ...newTrend(rng, def.volatility),
    candles: [],
  };
}

export interface CreateMarketOptions {
  /** Real time in ms used to anchor virtual time; pass a constant in tests. */
  now?: number;
  warmupCandles?: number;
  assets?: readonly AssetDefinition[];
}

/**
 * Builds a fresh market and pre-generates some history so the chart is not
 * empty on start. Warm-up ticks run without news.
 */
export function createMarket(seed: number, options: CreateMarketOptions = {}): MarketSnapshot {
  const assets = options.assets ?? ASSETS;
  const warmupCandles = options.warmupCandles ?? WARMUP_CANDLES;
  const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000);
  const alignedNow = nowSeconds - (nowSeconds % CANDLE_SECONDS);
  const warmupTicks = warmupCandles * TICKS_PER_CANDLE;

  const rng = new SeededRandom(normalizeSeed(seed));
  const runtime: Record<AssetId, AssetRuntime> = {};
  for (const def of assets) runtime[def.id] = initialRuntime(def, rng);

  let snapshot: MarketSnapshot = {
    seed: normalizeSeed(seed),
    rngState: rng.state,
    tick: -1,
    startTime: alignedNow - warmupCandles * CANDLE_SECONDS,
    assets: runtime,
    activeNews: [],
    newsLog: [],
    newsSeq: 0,
  };

  for (let i = 0; i < warmupTicks; i++) {
    snapshot = advanceMarket(snapshot, assets, { newsEnabled: false }).snapshot;
  }

  // Session change % is measured from the moment the player joins.
  const assetsWithOpen: Record<AssetId, AssetRuntime> = {};
  for (const [id, a] of Object.entries(snapshot.assets)) {
    assetsWithOpen[id] = { ...a, sessionOpen: a.price };
  }
  return { ...snapshot, assets: assetsWithOpen };
}

export function pricesOf(snapshot: MarketSnapshot): Record<AssetId, number> {
  const prices: Record<AssetId, number> = {};
  for (const [id, a] of Object.entries(snapshot.assets)) prices[id] = a.price;
  return prices;
}

/** True when the tick closes a candle bucket (used to sample the equity curve). */
export function isCandleBoundary(tick: number): boolean {
  return tick % TICKS_PER_CANDLE === TICKS_PER_CANDLE - 1;
}
