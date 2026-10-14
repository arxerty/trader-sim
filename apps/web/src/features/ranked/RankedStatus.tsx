import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { ApiError } from '@/api/client';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useMarketStore } from '@/store/marketStore';
import { useRunStore } from '@/store/runStore';
import { useUiStore } from '@/store/uiStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { Button, toast } from '@/shared/ui';
import { finishRankedRun, rankedEvents, startRankedRun } from './rankedService';

/** Header widget: ranked/practice state, ticks left, start & finish buttons. */
export function RankedStatus() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const run = useRunStore((s) => s.run);
  const pending = useRunStore((s) => s.pendingFinish);
  const queued = useRunStore((s) => s.queue.length);
  const seed = useMarketStore((s) => s.seed);
  const tick = useMarketStore((s) => s.tick);
  const errorMessage = useApiErrorMessage();
  const start = useMutation({
    mutationFn: () => startRankedRun('standard'),
    onError: (e) =>
      toast.show({
        title: t('ranked.startFailed'),
        description: errorMessage(e),
        variant: 'error',
      }),
  });
  const finish = useMutation({ mutationFn: finishRankedRun });

  if (!user) return null;
  const ranked = run && run.seed === seed;

  if (pending) {
    return (
      <span
        role="status"
        title={t('ranked.queuedHint')}
        className="rounded bg-warning/15 px-2 py-1 text-xs text-warning"
      >
        ⏳ {t('ranked.queued')}
        <span className="sr-only"> – {t('ranked.queuedHint')}</span>
      </span>
    );
  }
  if (!ranked) {
    return (
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-muted lg:inline">{t('ranked.practice')}</span>
        <Button
          size="sm"
          variant="primary"
          disabled={start.isPending}
          onClick={() => start.mutate()}
        >
          🏆 {t('ranked.play')}
        </Button>
      </div>
    );
  }
  const left = Math.max(0, run.startTick + run.maxTicks - tick);
  const minutes = Math.floor(left / 60);
  const seconds = String(left % 60).padStart(2, '0');
  return (
    <div className="flex items-center gap-2">
      <span
        title={t('ranked.activeHint', { count: queued })}
        className={cn(
          'rounded px-2 py-1 text-xs font-semibold',
          run.mode === 'daily' ? 'bg-warning/15 text-warning' : 'bg-accent/15 text-accent',
        )}
      >
        {t(`ranked.modes.${run.mode}`)} · {minutes}:{seconds}
        <span className="sr-only"> – {t('ranked.activeHint', { count: queued })}</span>
      </span>
      <Button
        size="sm"
        variant="secondary"
        disabled={finish.isPending}
        onClick={() => finish.mutate()}
      >
        {t('ranked.finish')}
      </Button>
    </div>
  );
}

/** Toasts for ranked-run lifecycle events. */
export function RankedToasts() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const errorMessage = useApiErrorMessage();
  const openCommunity = useUiStore((s) => s.openCommunity);
  useEffect(
    () =>
      rankedEvents.subscribe((e) => {
        switch (e.type) {
          case 'started':
            toast.show({ title: t(`ranked.started.${e.mode}`), variant: 'info', icon: '🏁' });
            break;
          case 'queued':
            toast.show({
              title: t('ranked.queued'),
              description: t('ranked.queuedHint'),
              variant: 'warning',
              icon: '⏳',
            });
            break;
          case 'lost':
            toast.show({
              title: t('ranked.lost'),
              description: errorMessage(new ApiError(0, e.code, e.code)),
              variant: 'error',
              duration: 8000,
            });
            break;
          case 'finished': {
            const s = e.result.summary;
            const title =
              e.result.status === 'flagged'
                ? t('ranked.flagged')
                : e.result.ranked
                  ? t('ranked.accepted')
                  : t('ranked.unranked');
            toast.show({
              title,
              description: s
                ? `${fmt.currency(s.finalEquity)} (${fmt.percent(s.roi, true)}) · +${e.result.xpGained} XP`
                : undefined,
              variant: e.result.status === 'flagged' ? 'warning' : 'success',
              icon: e.result.status === 'flagged' ? '🔎' : '🏆',
              duration: 8000,
            });
            if (e.result.ranked) openCommunity(e.result.mode === 'daily' ? 'daily' : 'leaderboard');
            break;
          }
        }
      }),
    [t, fmt, errorMessage, openCommunity],
  );
  return null;
}
