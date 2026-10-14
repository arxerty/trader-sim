import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { dailyApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useRunStore } from '@/store/runStore';
import { useUiStore } from '@/store/uiStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { Button, ErrorState, Skeleton } from '@/shared/ui';
import { startRankedRun } from '@/features/ranked/rankedService';
import { OnlineLeaderboard } from '@/features/leaderboard/OnlineLeaderboard';

function useCountdown(seconds: number | undefined): string {
  const [left, setLeft] = useState(seconds ?? 0);
  useEffect(() => {
    setLeft(seconds ?? 0);
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [seconds]);
  const h = Math.floor(left / 3600);
  const m = Math.floor((left % 3600) / 60);
  const s = left % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Today's challenge: same seed for everyone, one counted attempt. */
export function DailyPanel() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const errorMessage = useApiErrorMessage();
  const user = useAuthStore((s) => s.user);
  const close = useUiStore((s) => s.closeCommunity);
  const localRunId = useRunStore((s) => s.run?.runId);
  const daily = useQuery({
    queryKey: [...queryKeys.daily, user?.id ?? 'guest'],
    queryFn: dailyApi.get,
  });
  const countdown = useCountdown(daily.data?.resetsIn);
  const play = useMutation({
    mutationFn: () => startRankedRun('daily'),
    onSuccess: () => close(),
  });

  if (daily.isPending) return <Skeleton rows={4} />;
  if (daily.isError)
    return <ErrorState message={errorMessage(daily.error)} onRetry={() => void daily.refetch()} />;
  const d = daily.data;

  return (
    <div className="flex flex-col gap-3">
      <div className="m-3 mb-0 grid gap-3 rounded border border-border bg-surface-2/50 p-4 sm:grid-cols-[1fr_auto]">
        <div>
          <h3 className="text-lg font-bold">{t('daily.title', { date: fmt.dateOnly(d.date) })}</h3>
          <p className="mt-1 text-sm text-muted">{t('daily.description')}</p>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            <div>
              <dt className="text-muted">{t('daily.resetsIn')}</dt>
              <dd className="font-mono text-sm" aria-live="off">
                {countdown}
              </dd>
            </div>
            <div>
              <dt className="text-muted">{t('daily.participants')}</dt>
              <dd className="font-mono text-sm">{fmt.number(d.participants, 0)}</dd>
            </div>
            {d.result && (
              <>
                <div>
                  <dt className="text-muted">{t('daily.yourResult')}</dt>
                  <dd className="font-mono text-sm">
                    {fmt.currency(d.result.finalEquity)} ({fmt.percent(d.result.roi, true)})
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">{t('daily.yourRank')}</dt>
                  <dd className="font-mono text-sm">
                    {d.result.rank ? `#${d.result.rank}` : t('common.notAvailable')}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </div>
        <div className="flex flex-col items-stretch justify-center gap-2">
          {!user ? (
            <Button variant="primary" onClick={() => useUiStore.getState().openAuth('login')}>
              {t('daily.signInToPlay')}
            </Button>
          ) : d.activeRunId ? (
            localRunId === d.activeRunId ? (
              <Button variant="primary" size="lg" onClick={close}>
                {t('daily.continue')}
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">{t('daily.inProgressElsewhere')}</p>
            )
          ) : d.played ? (
            <p className="rounded bg-up/10 px-3 py-2 text-center text-sm text-up">
              {t('daily.played')}
            </p>
          ) : (
            <Button
              variant="primary"
              size="lg"
              disabled={play.isPending}
              onClick={() => play.mutate()}
            >
              {t('daily.play')}
            </Button>
          )}
          {play.isError && (
            <p role="alert" className="text-xs text-down">
              {errorMessage(play.error)}
            </p>
          )}
        </div>
      </div>
      <OnlineLeaderboard initialPeriod="daily" />
    </div>
  );
}
