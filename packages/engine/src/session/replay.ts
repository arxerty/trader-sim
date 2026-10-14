import type { GameAction, RunConfig, RunSummary, SessionState, TradeErrorCode } from '../types';
import { TICKS_PER_CANDLE } from '../market/candles';
import { WARMUP_CANDLES } from '../market/simulation';
import { applyAction, createSession, stepSession, summarizeSession } from './session';

/** Market tick right after warm-up – the first tick a player can act on. */
export const RUN_START_TICK = WARMUP_CANDLES * TICKS_PER_CANDLE - 1;

export interface ReplayRejection {
  index: number;
  tick: number;
  reason: TradeErrorCode | 'nonMonotonicTick' | 'tickOutOfRange' | 'afterBankruptcy';
}

export interface ReplayResult {
  state: SessionState;
  summary: RunSummary;
  rejected: ReplayRejection[];
  finalTick: number;
}

/**
 * Deterministically re-runs a game from its config and action log.
 * The server uses this to compute the authoritative result of a run; the
 * client-reported result is only compared against it.
 */
export function replayRun(
  config: RunConfig,
  actions: readonly GameAction[],
  finalTick: number,
): ReplayResult {
  const lastAllowed = RUN_START_TICK + config.maxTicks;
  const target = Math.min(Math.max(finalTick, RUN_START_TICK), lastAllowed);
  let state = createSession(config);
  const rejected: ReplayRejection[] = [];
  let lastTick = RUN_START_TICK;

  actions.forEach((action, index) => {
    if (action.tick < lastTick) {
      rejected.push({ index, tick: action.tick, reason: 'nonMonotonicTick' });
      return;
    }
    if (action.tick > target) {
      rejected.push({ index, tick: action.tick, reason: 'tickOutOfRange' });
      return;
    }
    lastTick = action.tick;
    while (state.market.tick < action.tick && !state.bankrupt) state = stepSession(state).state;
    if (state.market.tick !== action.tick) {
      rejected.push({ index, tick: action.tick, reason: 'afterBankruptcy' });
      return;
    }
    const applied = applyAction(state, action);
    if (!applied.result.ok) {
      rejected.push({ index, tick: action.tick, reason: applied.result.error });
      return;
    }
    state = applied.state;
  });

  while (state.market.tick < target && !state.bankrupt) state = stepSession(state).state;

  return {
    state,
    summary: summarizeSession(state, RUN_START_TICK, config.startingBalance),
    rejected,
    finalTick: state.market.tick,
  };
}
