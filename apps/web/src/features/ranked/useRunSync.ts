import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { gameEvents } from '@/store/game';
import { useAuthStore } from '@/store/authStore';
import {
  finishRankedRun,
  flushActions,
  rankedEvents,
  reconcileRun,
  submitPendingFinish,
} from './rankedService';

const CHECKPOINT_INTERVAL_MS = 15_000;

/**
 * Background sync of the ranked run: periodic checkpoints, automatic submit
 * when the run ends, and retry of everything queued while offline.
 */
export function useRunSync(): void {
  const status = useAuthStore((s) => s.status);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (status !== 'authenticated') return;
    void reconcileRun();
    const timer = window.setInterval(() => void flushActions(), CHECKPOINT_INTERVAL_MS);
    const onOnline = () => {
      void submitPendingFinish();
      void flushActions();
    };
    window.addEventListener('online', onOnline);
    const offGame = gameEvents.subscribe((e) => {
      if (e.type === 'runEnded') void finishRankedRun();
    });
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      offGame();
    };
  }, [status]);

  useEffect(
    () =>
      rankedEvents.subscribe((e) => {
        if (e.type === 'finished') {
          void queryClient.invalidateQueries({ queryKey: ['leaderboard'] });
          void queryClient.invalidateQueries({ queryKey: ['daily'] });
          void queryClient.invalidateQueries({ queryKey: ['me'] });
          void queryClient.invalidateQueries({ queryKey: ['profile'] });
        }
      }),
    [queryClient],
  );
}
