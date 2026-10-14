import { z } from 'zod';
import { MAX_ACTIONS_PER_BATCH } from '../constants';

const tick = z.number().int().min(0).max(10_000_000);
const id = z.string().min(1).max(32);

export const orderRequestSchema = z.object({
  assetId: z.string().min(1).max(16),
  side: z.enum(['long', 'short']),
  type: z.enum(['market', 'limit']),
  margin: z.number().positive().finite().max(1e12),
  leverage: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
  limitPrice: z.number().positive().finite().optional(),
  stopLoss: z.number().positive().finite().optional(),
  takeProfit: z.number().positive().finite().optional(),
});

/** Mirrors `GameAction` from the engine. */
export const gameActionSchema = z.discriminatedUnion('type', [
  z.object({ tick, type: z.literal('placeOrder'), payload: orderRequestSchema }),
  z.object({ tick, type: z.literal('closePosition'), payload: z.object({ positionId: id }) }),
  z.object({ tick, type: z.literal('cancelOrder'), payload: z.object({ orderId: id }) }),
  z.object({ tick, type: z.literal('pause') }),
  z.object({ tick, type: z.literal('resume') }),
]);
export type GameActionDto = z.infer<typeof gameActionSchema>;

export const runModeSchema = z.enum(['standard', 'daily']);
export type RunMode = z.infer<typeof runModeSchema>;

export const createRunBodySchema = z.object({ mode: runModeSchema.default('standard') });

export const runConfigSchema = z.object({
  runId: z.string(),
  mode: runModeSchema,
  seed: z.number().int(),
  startTime: z.number().int(),
  startingBalance: z.number(),
  maxTicks: z.number().int(),
  startTick: z.number().int(),
  engineVersion: z.string(),
  assets: z.array(z.string()),
  expiresAt: z.string(),
  dailyDate: z.string().nullable(),
});
export type RunConfigDto = z.infer<typeof runConfigSchema>;

export const actionsBatchBodySchema = z.object({
  actions: z.array(gameActionSchema).max(MAX_ACTIONS_PER_BATCH),
  /** Current market tick on the client – used for pacing checks. */
  clientTick: tick,
});
export type ActionsBatchBody = z.infer<typeof actionsBatchBodySchema>;

export const finishRunBodySchema = z.object({
  finalTick: tick,
  engineVersion: z.string().max(32),
  /** Optional trailing actions not yet sent as a checkpoint. */
  actions: z.array(gameActionSchema).max(MAX_ACTIONS_PER_BATCH).default([]),
  /** Client-side result: used only for comparison with the server replay. */
  clientSummary: z.object({ finalEquity: z.number().finite() }),
});
export type FinishRunBody = z.input<typeof finishRunBodySchema>;

export const runFlagSchema = z.enum([
  'CLIENT_MISMATCH',
  'REJECTED_ACTIONS',
  'UNREALISTIC_GROWTH',
  'ENGINE_VERSION_MISMATCH',
]);
export type RunFlag = z.infer<typeof runFlagSchema>;

export const runStatusSchema = z.enum(['active', 'finished', 'flagged', 'abandoned', 'expired']);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const runSummarySchema = z.object({
  finalEquity: z.number(),
  roi: z.number(),
  ticks: z.number().int(),
  totalTrades: z.number().int(),
  winRate: z.number(),
  bestTrade: z.number().nullable(),
  longestWinStreak: z.number().int(),
  maxDrawdown: z.number(),
  riskScore: z.number(),
  bankrupt: z.boolean(),
  achievements: z.array(z.string()),
});

export const runResultSchema = z.object({
  runId: z.string(),
  mode: runModeSchema,
  status: runStatusSchema,
  ranked: z.boolean(),
  flags: z.array(runFlagSchema),
  summary: runSummarySchema.nullable(),
  clientEquity: z.number().nullable(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  xpGained: z.number().int(),
  newAchievements: z.array(z.string()),
});
export type RunResultDto = z.infer<typeof runResultSchema>;

export const actionsAcceptedSchema = z.object({
  accepted: z.number().int(),
  lastTick: z.number().int(),
});
