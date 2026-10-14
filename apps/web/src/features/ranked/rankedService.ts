import { ENGINE_VERSION } from '@trader-sim/engine';
import {
  MAX_ACTIONS_PER_BATCH,
  type ErrorCode,
  type RunMode,
  type RunResultDto,
} from '@trader-sim/shared';
import { isApiError, type ClientErrorCode } from '@/api/client';
import { runsApi } from '@/api/endpoints';
import { EventBus } from '@/shared/lib/eventBus';
import { useMarketStore } from '@/store/marketStore';
import { useRunStore } from '@/store/runStore';
import { useSettingsStore } from '@/store/settingsStore';
import { currentEquity, startRankedSession } from '@/store/game';

export type RankedEvent =
  | { type: 'started'; mode: RunMode }
  | { type: 'finished'; result: RunResultDto }
  /** The server no longer accepts the run (expired, rejected…); play continues unranked. */
  | { type: 'lost'; code: ClientErrorCode }
  | { type: 'queued' };

export const rankedEvents = new EventBus<RankedEvent>();

/** Errors after which the run cannot continue on the server. */
const FATAL: readonly ErrorCode[] = [
  'RUN_NOT_FOUND',
  'RUN_NOT_ACTIVE',
  'RUN_EXPIRED',
  'ACTIONS_INVALID',
  'ACTIONS_TOO_FAST',
  'ACTIONS_LIMIT',
  'UNAUTHORIZED',
  'TOKEN_INVALID',
];

const isFatal = (e: unknown) => isApiError(e) && (FATAL as readonly string[]).includes(e.code);

function loseRun(e: unknown): void {
  useRunStore.getState().clear();
  rankedEvents.emit({ type: 'lost', code: isApiError(e) ? e.code : 'UNKNOWN' });
}

/** Creates a run on the server (abandoning a leftover one) and starts playing it. */
export async function startRankedRun(mode: RunMode): Promise<void> {
  const store = useRunStore.getState();
  if (store.pendingFinish) await submitPendingFinish();
  const leftover = useRunStore.getState().run;
  if (leftover) {
    await runsApi.abandon(leftover.runId).catch(() => undefined);
    useRunStore.getState().clear();
  }
  let config;
  try {
    config = await runsApi.create(mode);
  } catch (e) {
    const details = isApiError(e) ? (e.details as { runId?: string } | undefined) : undefined;
    if (!isApiError(e) || e.code !== 'RUN_ALREADY_ACTIVE' || !details?.runId) throw e;
    await runsApi.abandon(details.runId);
    config = await runsApi.create(mode);
  }
  useRunStore.getState().setRun(config);
  useRunStore.getState().setLastResult(null);
  startRankedSession(config);
  rankedEvents.emit({ type: 'started', mode });
}

let flushing: Promise<void> | null = null;

/** Sends queued actions as checkpoints. Network errors leave the queue for a later retry. */
export function flushActions(keepTail = 0): Promise<void> {
  flushing ??= (async () => {
    try {
      for (;;) {
        const { run, queue } = useRunStore.getState();
        if (!run || queue.length <= keepTail) return;
        const batch = queue.slice(0, Math.min(MAX_ACTIONS_PER_BATCH, queue.length - keepTail));
        const lastTick = batch[batch.length - 1]?.tick ?? run.startTick;
        const marketTick =
          useMarketStore.getState().seed === run.seed ? useMarketStore.getState().tick : lastTick;
        await runsApi.actions(run.runId, batch, Math.max(lastTick, marketTick));
        useRunStore.getState().acknowledge(batch.length);
      }
    } catch (e) {
      if (isFatal(e)) loseRun(e);
    } finally {
      flushing = null;
    }
  })();
  return flushing;
}

/** Freezes the run at the current tick and submits it (queued if offline). */
export async function finishRankedRun(): Promise<RunResultDto | null> {
  const { run, pendingFinish } = useRunStore.getState();
  if (!run) return null;
  if (!pendingFinish) {
    useRunStore.getState().setPendingFinish({
      runId: run.runId,
      finalTick: useMarketStore.getState().tick,
      finalEquity: currentEquity(),
      engineVersion: ENGINE_VERSION,
    });
    useSettingsStore.getState().setPaused(true);
  }
  return submitPendingFinish();
}

let finishing: Promise<RunResultDto | null> | null = null;

export function submitPendingFinish(): Promise<RunResultDto | null> {
  finishing ??= (async () => {
    try {
      const pending = useRunStore.getState().pendingFinish;
      if (!pending) return null;
      // Everything but the last batch goes as checkpoints; the tail rides along with /finish.
      await flushActions(MAX_ACTIONS_PER_BATCH);
      const { queue, run } = useRunStore.getState();
      if (!run) return null;
      if (queue.length > MAX_ACTIONS_PER_BATCH) return null; // still offline
      const result = await runsApi.finish(pending.runId, {
        finalTick: pending.finalTick,
        engineVersion: pending.engineVersion,
        actions: queue,
        clientSummary: { finalEquity: pending.finalEquity },
      });
      useRunStore.getState().clear();
      useRunStore.getState().setLastResult(result);
      rankedEvents.emit({ type: 'finished', result });
      return result;
    } catch (e) {
      if (isApiError(e) && e.code === 'NETWORK') {
        rankedEvents.emit({ type: 'queued' });
        return null;
      }
      loseRun(e);
      return null;
    } finally {
      finishing = null;
    }
  })();
  return finishing;
}

/** Reconciles the locally remembered run with the server after sign-in. */
export async function reconcileRun(): Promise<void> {
  const { run, pendingFinish } = useRunStore.getState();
  if (pendingFinish) {
    await submitPendingFinish();
    return;
  }
  if (!run) return;
  try {
    const { run: serverRun } = await runsApi.active();
    if (!serverRun || serverRun.runId !== run.runId) useRunStore.getState().clear();
  } catch (e) {
    if (isFatal(e)) useRunStore.getState().clear();
  }
}
