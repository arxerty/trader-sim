/** Domain types shared by the engine, stores and UI. No React here. */

export type AssetId = string;

export type AssetCategory =
  'tech' | 'energy' | 'metal' | 'crypto' | 'index' | 'auto' | 'pharma' | 'agri';

export interface AssetDefinition {
  id: AssetId;
  /** Ticker shown in the UI. The human-readable name lives in locales (`assets.<id>.name`). */
  symbol: string;
  category: AssetCategory;
  initialPrice: number;
  /** Per-tick GBM sigma. */
  volatility: number;
  /** Per-tick GBM drift (mu). */
  drift: number;
  /** Probability of a sudden jump on any tick. */
  jumpProbability: number;
  /** Typical jump size as a fraction of the price (0.05 = 5%). */
  jumpScale: number;
  /** Decimal places used to display prices. */
  decimals: number;
}

export interface Candle {
  /** Unix time in seconds (virtual market time). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface AssetRuntime {
  price: number;
  /** Price at the start of the session, used for "change %" in the watchlist. */
  sessionOpen: number;
  /** Current trend regime drift added on top of the base drift. */
  trend: number;
  trendTicksLeft: number;
  candles: Candle[];
}

export type NewsSentiment = 'positive' | 'negative';

export interface NewsParams {
  count?: number;
  percent?: number;
}

export interface NewsEvent {
  id: string;
  assetId: AssetId;
  templateId: string;
  sentiment: NewsSentiment;
  /** 0..1 – how hard the news pushes the price. */
  strength: number;
  /** Total effect duration in ticks. */
  duration: number;
  /** Ticks left until the effect fades. */
  remaining: number;
  tick: number;
  /** Virtual market time in seconds. */
  time: number;
  params: NewsParams;
}

export interface MarketSnapshot {
  seed: number;
  rngState: number;
  tick: number;
  /** Virtual unix time (seconds) of tick 0. */
  startTime: number;
  assets: Record<AssetId, AssetRuntime>;
  activeNews: NewsEvent[];
  newsLog: NewsEvent[];
  newsSeq: number;
}

export type Side = 'long' | 'short';
export type OrderType = 'market' | 'limit';
export type Leverage = 1 | 2 | 5 | 10;
export type CloseReason = 'manual' | 'stopLoss' | 'takeProfit' | 'liquidation';

export interface OrderRequest {
  assetId: AssetId;
  side: Side;
  type: OrderType;
  /** Collateral committed to the trade, in USD. */
  margin: number;
  leverage: Leverage;
  limitPrice?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface Position {
  id: string;
  assetId: AssetId;
  side: Side;
  entryPrice: number;
  quantity: number;
  leverage: Leverage;
  margin: number;
  openFee: number;
  stopLoss?: number;
  takeProfit?: number;
  openedTick: number;
  openedAt: number;
}

export interface PendingOrder {
  id: string;
  assetId: AssetId;
  side: Side;
  type: 'limit';
  limitPrice: number;
  margin: number;
  leverage: Leverage;
  /** Fee reserved at placement, charged when the order fills. */
  reservedFee: number;
  stopLoss?: number;
  takeProfit?: number;
  createdTick: number;
  createdAt: number;
}

export interface ClosedTrade {
  id: string;
  positionId: string;
  assetId: AssetId;
  side: Side;
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  leverage: Leverage;
  margin: number;
  /** Net P&L including open and close fees. */
  pnl: number;
  fees: number;
  reason: CloseReason;
  openedTick: number;
  closedTick: number;
  openedAt: number;
  closedAt: number;
}

export interface Account {
  balance: number;
  positions: Position[];
  orders: PendingOrder[];
  trades: ClosedTrade[];
  /** Monotonic counter used to build deterministic ids. */
  seq: number;
}

export interface AccountSummary {
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  usedMargin: number;
  freeMargin: number;
  /** equity / usedMargin * 100, or null when nothing is used. */
  marginLevel: number | null;
  totalFees: number;
}

export type TradeErrorCode =
  | 'unknownAsset'
  | 'invalidAmount'
  | 'amountTooSmall'
  | 'invalidLeverage'
  | 'insufficientFunds'
  | 'invalidLimitPrice'
  | 'invalidStopLoss'
  | 'invalidTakeProfit'
  | 'positionNotFound'
  | 'orderNotFound'
  | 'marketClosed'
  | 'duplicateAction';

export type Result<T, E = TradeErrorCode> = { ok: true; value: T } | { ok: false; error: E };

export type TraderLevel = 'novice' | 'amateur' | 'pro' | 'legend';

export type AchievementId =
  | 'firstTrade'
  | 'firstProfit'
  | 'tenTrades'
  | 'fiftyTrades'
  | 'bigWin'
  | 'highRoller'
  | 'bearHunter'
  | 'diversified'
  | 'hotStreak'
  | 'disciplined'
  | 'riskManager'
  | 'phoenix'
  | 'doubleUp'
  | 'multitasker';

export interface TradingStats {
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  bestTrade: number | null;
  worstTrade: number | null;
  averagePnl: number;
  averageWin: number;
  averageLoss: number;
  totalPnl: number;
  /** Max peak-to-trough equity drop as a fraction (0.25 = 25%). */
  maxDrawdown: number;
  longestWinStreak: number;
}

export interface LeaderboardEntry {
  id: string;
  /** Real wall-clock time (ms) when the session ended. */
  date: number;
  finalEquity: number;
  returnPct: number;
  trades: number;
  winRate: number;
  bankrupt: boolean;
}

export type ThemeName = 'light' | 'dark' | 'terminal';
export type ThemePreference = ThemeName | 'system';
export type GameSpeed = 1 | 2 | 5;
