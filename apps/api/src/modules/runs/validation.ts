import { RUN_START_TICK } from '@trader-sim/engine';
import {
  MAX_ACTIONS_PER_RUN,
  MAX_ACTIONS_PER_TICK,
  MAX_TICKS_PER_SECOND,
  TICK_PACING_SLACK,
  type GameActionDto,
} from '@trader-sim/shared';
import { AppError } from '../../lib/errors';

export interface RunProgress {
  startedAt: Date;
  lastTick: number;
  maxTicks: number;
  actionCount: number;
  /** Actions already stored on `lastTick` (for the per-tick limit across batches). */
  actionsOnLastTick: number;
}

/** Highest tick the player could have legitimately reached by `now` (5× speed + slack). */
export function maxReachableTick(startedAt: Date, now: Date): number {
  const elapsedSeconds = Math.max(0, (now.getTime() - startedAt.getTime()) / 1000);
  return RUN_START_TICK + Math.floor(elapsedSeconds * MAX_TICKS_PER_SECOND) + TICK_PACING_SLACK;
}

/**
 * Cheap structural checks done on every checkpoint before anything is stored:
 * monotonic ticks, run bounds, action rate limits and real-time pacing.
 * Business validity (funds, ids…) is checked later by the replay.
 */
export function validateActionBatch(
  run: RunProgress,
  actions: readonly GameActionDto[],
  clientTick: number,
  now: Date,
): void {
  const lastAllowed = RUN_START_TICK + run.maxTicks;
  if (run.actionCount + actions.length > MAX_ACTIONS_PER_RUN) {
    throw new AppError(
      422,
      'ACTIONS_LIMIT',
      `A run may contain at most ${MAX_ACTIONS_PER_RUN} actions`,
    );
  }
  let last = run.lastTick;
  let perTick = run.actionsOnLastTick;
  for (const [i, action] of actions.entries()) {
    if (action.tick < last) {
      throw new AppError(
        422,
        'ACTIONS_INVALID',
        `Action #${i} goes back in time (tick ${action.tick} < ${last})`,
      );
    }
    if (action.tick < RUN_START_TICK || action.tick > lastAllowed) {
      throw new AppError(
        422,
        'ACTIONS_INVALID',
        `Action #${i} is outside the run (tick ${action.tick})`,
      );
    }
    perTick = action.tick === last ? perTick + 1 : 1;
    if (perTick > MAX_ACTIONS_PER_TICK) {
      throw new AppError(422, 'ACTIONS_LIMIT', `Too many actions on tick ${action.tick}`);
    }
    last = action.tick;
  }
  if (clientTick < last || clientTick > lastAllowed) {
    throw new AppError(
      422,
      'ACTIONS_INVALID',
      `Client tick ${clientTick} is inconsistent with the action log`,
    );
  }
  if (clientTick > maxReachableTick(run.startedAt, now)) {
    throw new AppError(
      422,
      'ACTIONS_TOO_FAST',
      'The game advanced faster than the maximum speed allows',
    );
  }
}
