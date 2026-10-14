import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { getAchievement, type AchievementId } from '@trader-sim/engine';
import { usersApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { Button, EmptyState, ErrorState, Skeleton } from '@/shared/ui';
import { StatCard } from '@/features/stats';
import { AccountSettings } from './AccountSettings';

/** Public profile of `nickname`, or of the signed-in player (with account settings). */
export function ProfilePanel({ nickname }: { nickname?: string }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const errorMessage = useApiErrorMessage();
  const user = useAuthStore((s) => s.user);
  const target = nickname ?? user?.nickname;
  const isOwn = Boolean(user && target && user.nickname.toLowerCase() === target.toLowerCase());
  const profile = useQuery({
    queryKey: queryKeys.profile(target ?? ''),
    queryFn: () => usersApi.profile(target ?? ''),
    enabled: Boolean(target),
  });

  if (!target) {
    return (
      <EmptyState icon="👤" title={t('profile.signInTitle')}>
        <Button
          size="sm"
          variant="primary"
          onClick={() => useUiStore.getState().openAuth('register')}
        >
          {t('auth.createAccount')}
        </Button>
      </EmptyState>
    );
  }
  if (profile.isPending) return <Skeleton rows={5} />;
  if (profile.isError)
    return (
      <ErrorState message={errorMessage(profile.error)} onRetry={() => void profile.refetch()} />
    );
  const p = profile.data;
  const na = t('common.notAvailable');

  return (
    <div className="flex flex-col gap-4 p-3">
      <header className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-xl font-bold text-accent"
        >
          {p.avatar ? (
            <img src={p.avatar} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            p.nickname.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <h3 className="text-lg font-bold">{p.nickname}</h3>
          <p className="text-xs text-muted">
            {t(`stats.levels.${p.level}`, { defaultValue: p.level })} ·{' '}
            {t('stats.xp', { xp: fmt.number(p.xp, 0) })} ·{' '}
            {t('profile.memberSince', { date: fmt.dateOnly(p.memberSince) })}
          </p>
          {p.isFriend && (
            <span className="mt-1 inline-block rounded bg-up/15 px-1.5 text-[10px] text-up">
              {t('profile.friend')}
            </span>
          )}
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <StatCard label={t('profile.runs')} value={fmt.number(p.stats.runs, 0)} />
        <StatCard label={t('stats.totalTrades')} value={fmt.number(p.stats.totalTrades, 0)} />
        <StatCard label={t('stats.winRate')} value={fmt.percent(p.stats.winRate, false, 1)} />
        <StatCard
          label={t('profile.bestEquity')}
          value={p.stats.bestEquity === null ? na : fmt.currency(p.stats.bestEquity)}
        />
        <StatCard
          label={t('profile.bestRoi')}
          value={p.stats.bestRoi === null ? na : fmt.percent(p.stats.bestRoi, true)}
        />
      </dl>

      <section aria-labelledby="profile-achievements">
        <h3
          id="profile-achievements"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {t('sections.achievements')} ({p.achievements.length})
        </h3>
        {p.achievements.length === 0 ? (
          <p className="text-xs text-muted">{t('profile.noAchievements')}</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {p.achievements.map((a) => {
              const def = getAchievement(a.id as AchievementId);
              return (
                <li
                  key={a.id}
                  title={t(`achievements.items.${a.id}.title`)}
                  className="flex items-center gap-1 rounded border border-border bg-surface-2/60 px-2 py-1 text-xs"
                >
                  <span aria-hidden="true">{def?.icon ?? '🏅'}</span>
                  {t(`achievements.items.${a.id}.title`)}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="profile-runs">
        <h3
          id="profile-runs"
          className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {t('profile.bestRuns')}
        </h3>
        {p.bestRuns.length === 0 ? (
          <p className="text-xs text-muted">{t('profile.noRuns')}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {p.bestRuns.map((r) => (
              <li
                key={r.runId}
                className="flex justify-between rounded bg-surface-2/40 px-3 py-1.5"
              >
                <span className="text-muted">
                  {fmt.dateOnly(r.finishedAt)} ·{' '}
                  {t(`ranked.modes.${r.mode}`, { defaultValue: r.mode })}
                </span>
                <span className="font-mono">
                  {fmt.currency(r.finalEquity)}{' '}
                  <span className={r.roi >= 0 ? 'text-up' : 'text-down'}>
                    ({fmt.percent(r.roi, true)})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {isOwn && <AccountSettings />}
    </div>
  );
}
