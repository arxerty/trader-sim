import type {
  Account,
  AchievementId,
  AssetRuntime,
  Candle,
  ClosedTrade,
  CloseReason,
  GameSpeed,
  LeaderboardEntry,
  Leverage,
  MarketSnapshot,
  NewsEvent,
  PendingOrder,
  Position,
  Side,
  ThemePreference,
} from '@/types';
import { ASSETS } from '@trader-sim/engine';
import { createAccount, isLeverage, notionalValue, tradingFee } from '@trader-sim/engine';
import { ACHIEVEMENTS } from '@trader-sim/engine';
import { THEME_PREFERENCES } from '@/theme/themes';
import { isFiniteNumber, isRecord, isString, optionalNumber, parseArray } from './validators';

/**
 * Save-file schema versions. Bump a version and add a step to the matching
 * `migrate*` function whenever the persisted shape changes.
 */
export const SCHEMA_VERSIONS = {
  market: 1,
  portfolio: 3,
  settings: 1,
  progress: 1,
} as const;

export const STORAGE_KEYS = {
  market: 'trader-sim:market',
  portfolio: 'trader-sim:portfolio',
  settings: 'trader-sim:settings',
  progress: 'trader-sim:progress',
} as const;

/* ------------------------------------------------------------------ portfolio */

export interface PortfolioData {
  account: Account;
  equityHistory: number[];
  maxLeverageUsed: number;
  maxOpenPositions: number;
  bankrupt: boolean;
}

const isSide = (v: unknown): v is Side => v === 'long' || v === 'short';
const CLOSE_REASONS: readonly CloseReason[] = ['manual', 'stopLoss', 'takeProfit', 'liquidation'];
const isCloseReason = (v: unknown): v is CloseReason => CLOSE_REASONS.includes(v as CloseReason);

function parsePosition(v: unknown): Position | null {
  if (!isRecord(v)) return null;
  const { id, assetId, side, entryPrice, quantity, leverage, margin } = v;
  if (!isString(id) || !isString(assetId) || !isSide(side) || !isLeverage(leverage)) return null;
  if (!isFiniteNumber(entryPrice) || entryPrice <= 0) return null;
  if (!isFiniteNumber(quantity) || quantity <= 0 || !isFiniteNumber(margin) || margin <= 0)
    return null;
  const position: Position = {
    id,
    assetId,
    side,
    entryPrice,
    quantity,
    leverage,
    margin,
    openFee: isFiniteNumber(v.openFee) ? v.openFee : tradingFee(notionalValue(margin, leverage)),
    openedTick: isFiniteNumber(v.openedTick) ? v.openedTick : 0,
    openedAt: isFiniteNumber(v.openedAt) ? v.openedAt : 0,
  };
  const sl = optionalNumber(v.stopLoss);
  const tp = optionalNumber(v.takeProfit);
  if (sl !== undefined) position.stopLoss = sl;
  if (tp !== undefined) position.takeProfit = tp;
  return position;
}

function parseOrder(v: unknown): PendingOrder | null {
  if (!isRecord(v)) return null;
  const { id, assetId, side, limitPrice, margin, leverage } = v;
  if (!isString(id) || !isString(assetId) || !isSide(side) || !isLeverage(leverage)) return null;
  if (!isFiniteNumber(limitPrice) || limitPrice <= 0 || !isFiniteNumber(margin) || margin <= 0)
    return null;
  const order: PendingOrder = {
    id,
    assetId,
    side,
    type: 'limit',
    limitPrice,
    margin,
    leverage,
    reservedFee: isFiniteNumber(v.reservedFee)
      ? v.reservedFee
      : tradingFee(notionalValue(margin, leverage)),
    createdTick: isFiniteNumber(v.createdTick) ? v.createdTick : 0,
    createdAt: isFiniteNumber(v.createdAt) ? v.createdAt : 0,
  };
  const sl = optionalNumber(v.stopLoss);
  const tp = optionalNumber(v.takeProfit);
  if (sl !== undefined) order.stopLoss = sl;
  if (tp !== undefined) order.takeProfit = tp;
  return order;
}

function parseTrade(v: unknown): ClosedTrade | null {
  if (!isRecord(v)) return null;
  const { id, assetId, side, entryPrice, exitPrice, quantity, margin, pnl, leverage } = v;
  if (!isString(id) || !isString(assetId) || !isSide(side)) return null;
  if (![entryPrice, exitPrice, quantity, margin, pnl].every(isFiniteNumber)) return null;
  return {
    id,
    positionId: isString(v.positionId) ? v.positionId : id,
    assetId,
    side,
    entryPrice: entryPrice as number,
    exitPrice: exitPrice as number,
    quantity: quantity as number,
    leverage: isLeverage(leverage) ? leverage : (1 as Leverage),
    margin: margin as number,
    pnl: pnl as number,
    fees: isFiniteNumber(v.fees) ? v.fees : 0,
    reason: isCloseReason(v.reason) ? v.reason : 'manual',
    openedTick: isFiniteNumber(v.openedTick) ? v.openedTick : 0,
    closedTick: isFiniteNumber(v.closedTick) ? v.closedTick : 0,
    openedAt: isFiniteNumber(v.openedAt) ? v.openedAt : 0,
    closedAt: isFiniteNumber(v.closedAt) ? v.closedAt : 0,
  };
}

/** Validates the current (latest) portfolio shape. Returns null when unusable. */
export function sanitizePortfolio(value: unknown): PortfolioData | null {
  if (!isRecord(value) || !isRecord(value.account)) return null;
  const a = value.account;
  if (!isFiniteNumber(a.balance)) return null;
  const positions = parseArray(a.positions, parsePosition);
  const orders = parseArray(a.orders, parseOrder);
  const trades = parseArray(a.trades, parseTrade);
  const seqFromIds = [...positions, ...orders, ...trades].reduce((max, item) => {
    const n = Number(item.id.split('-')[1]);
    return Number.isFinite(n) ? Math.max(max, n) : max;
  }, 0);
  return {
    account: {
      balance: Math.max(0, a.balance),
      positions,
      orders,
      trades,
      seq: Math.max(isFiniteNumber(a.seq) ? a.seq : 0, seqFromIds),
    },
    equityHistory: parseArray(value.equityHistory, (x) => (isFiniteNumber(x) ? x : null)).slice(
      -1000,
    ),
    maxLeverageUsed: isFiniteNumber(value.maxLeverageUsed) ? value.maxLeverageUsed : 1,
    maxOpenPositions: isFiniteNumber(value.maxOpenPositions)
      ? value.maxOpenPositions
      : positions.length,
    bankrupt: value.bankrupt === true,
  };
}

/**
 * v1 (first public release) stored `{ cash, positions, history }` without
 * fees/limit orders. v2 introduced `account`, `openFee`, pending orders and
 * the equity curve.
 */
function migratePortfolioV1toV2(v1: unknown): unknown {
  if (!isRecord(v1)) return null;
  const account = createAccount(isFiniteNumber(v1.cash) ? v1.cash : 0);
  return {
    account: {
      ...account,
      positions: Array.isArray(v1.positions) ? v1.positions : [],
      trades: Array.isArray(v1.history) ? v1.history : [],
    },
    equityHistory: [],
    maxLeverageUsed: 1,
    bankrupt: false,
  };
}

/** v3 (engine sessions) added maxOpenPositions, needed for replay-identical achievements. */
function migratePortfolioV2toV3(v2: unknown): unknown {
  if (!isRecord(v2) || !isRecord(v2.account)) return v2;
  const positions = Array.isArray(v2.account.positions) ? v2.account.positions : [];
  return { ...v2, maxOpenPositions: positions.length };
}

export function migratePortfolio(persisted: unknown, fromVersion: number): PortfolioData | null {
  let data = persisted;
  if (fromVersion < 2) data = migratePortfolioV1toV2(data);
  if (fromVersion < 3) data = migratePortfolioV2toV3(data);
  if (fromVersion > SCHEMA_VERSIONS.portfolio) return null; // save from a newer app version
  return sanitizePortfolio(data);
}

/* --------------------------------------------------------------------- market */

function parseCandle(v: unknown): Candle | null {
  if (!isRecord(v)) return null;
  const { time, open, high, low, close } = v;
  if (![time, open, high, low, close].every(isFiniteNumber)) return null;
  return {
    time: time as number,
    open: open as number,
    high: high as number,
    low: low as number,
    close: close as number,
  };
}

function parseNews(v: unknown): NewsEvent | null {
  if (!isRecord(v)) return null;
  const { id, assetId, templateId, sentiment, strength, duration, remaining, tick, time } = v;
  if (!isString(id) || !isString(assetId) || !isString(templateId)) return null;
  if (sentiment !== 'positive' && sentiment !== 'negative') return null;
  if (![strength, duration, remaining, tick, time].every(isFiniteNumber)) return null;
  const params = isRecord(v.params) ? v.params : {};
  return {
    id,
    assetId,
    templateId,
    sentiment,
    strength: strength as number,
    duration: duration as number,
    remaining: remaining as number,
    tick: tick as number,
    time: time as number,
    params: {
      ...(isFiniteNumber(params.count) ? { count: params.count } : {}),
      ...(isFiniteNumber(params.percent) ? { percent: params.percent } : {}),
    },
  };
}

export function sanitizeMarket(value: unknown): MarketSnapshot | null {
  if (!isRecord(value) || !isRecord(value.assets)) return null;
  const { seed, rngState, tick, startTime, newsSeq } = value;
  if (![seed, rngState, tick, startTime].every(isFiniteNumber)) return null;
  const assets: Record<string, AssetRuntime> = {};
  for (const def of ASSETS) {
    const raw = value.assets[def.id];
    if (!isRecord(raw) || !isFiniteNumber(raw.price) || raw.price <= 0) return null;
    const candles = parseArray(raw.candles, parseCandle);
    if (candles.length === 0) return null;
    assets[def.id] = {
      price: raw.price,
      sessionOpen:
        isFiniteNumber(raw.sessionOpen) && raw.sessionOpen > 0 ? raw.sessionOpen : raw.price,
      trend: isFiniteNumber(raw.trend) ? raw.trend : 0,
      trendTicksLeft: isFiniteNumber(raw.trendTicksLeft) ? raw.trendTicksLeft : 1,
      candles,
    };
  }
  return {
    seed: seed as number,
    rngState: rngState as number,
    tick: tick as number,
    startTime: startTime as number,
    assets,
    activeNews: parseArray(value.activeNews, parseNews),
    newsLog: parseArray(value.newsLog, parseNews),
    newsSeq: isFiniteNumber(newsSeq) ? newsSeq : 0,
  };
}

export function migrateMarket(persisted: unknown, fromVersion: number): MarketSnapshot | null {
  if (fromVersion > SCHEMA_VERSIONS.market) return null;
  return sanitizeMarket(persisted);
}

/* ------------------------------------------------------------------- settings */

export interface SettingsData {
  theme: ThemePreference;
  soundEnabled: boolean;
  volume: number;
  speed: GameSpeed;
  selectedAssetId: string;
  onboardingCompleted: boolean;
}

export const DEFAULT_SETTINGS: SettingsData = {
  theme: 'system',
  soundEnabled: true,
  volume: 0.5,
  speed: 1,
  selectedAssetId: ASSETS[0]?.id ?? 'NOVA',
  onboardingCompleted: false,
};

const SPEEDS: readonly GameSpeed[] = [1, 2, 5];

export function sanitizeSettings(value: unknown): SettingsData {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  const assetIds = ASSETS.map((a) => a.id);
  return {
    theme: THEME_PREFERENCES.includes(value.theme as ThemePreference)
      ? (value.theme as ThemePreference)
      : DEFAULT_SETTINGS.theme,
    soundEnabled:
      typeof value.soundEnabled === 'boolean' ? value.soundEnabled : DEFAULT_SETTINGS.soundEnabled,
    volume: isFiniteNumber(value.volume)
      ? Math.min(1, Math.max(0, value.volume))
      : DEFAULT_SETTINGS.volume,
    speed: SPEEDS.includes(value.speed as GameSpeed)
      ? (value.speed as GameSpeed)
      : DEFAULT_SETTINGS.speed,
    selectedAssetId:
      isString(value.selectedAssetId) && assetIds.includes(value.selectedAssetId)
        ? value.selectedAssetId
        : DEFAULT_SETTINGS.selectedAssetId,
    onboardingCompleted: value.onboardingCompleted === true,
  };
}

/* ------------------------------------------------------------------- progress */

export interface ProgressData {
  xp: number;
  unlocked: Partial<Record<AchievementId, number>>;
  leaderboard: LeaderboardEntry[];
}

export const LEADERBOARD_SIZE = 10;

function parseEntry(v: unknown): LeaderboardEntry | null {
  if (!isRecord(v)) return null;
  const { id, date, finalEquity, returnPct, trades, winRate } = v;
  if (!isString(id) || ![date, finalEquity, returnPct, trades, winRate].every(isFiniteNumber))
    return null;
  return {
    id,
    date: date as number,
    finalEquity: finalEquity as number,
    returnPct: returnPct as number,
    trades: trades as number,
    winRate: winRate as number,
    bankrupt: v.bankrupt === true,
  };
}

export function sanitizeProgress(value: unknown): ProgressData {
  if (!isRecord(value)) return { xp: 0, unlocked: {}, leaderboard: [] };
  const unlocked: Partial<Record<AchievementId, number>> = {};
  if (isRecord(value.unlocked)) {
    for (const def of ACHIEVEMENTS) {
      const at = value.unlocked[def.id];
      if (isFiniteNumber(at)) unlocked[def.id] = at;
    }
  }
  return {
    xp: isFiniteNumber(value.xp) ? Math.max(0, value.xp) : 0,
    unlocked,
    leaderboard: parseArray(value.leaderboard, parseEntry)
      .sort((a, b) => b.finalEquity - a.finalEquity)
      .slice(0, LEADERBOARD_SIZE),
  };
}
