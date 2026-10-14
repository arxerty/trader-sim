import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  LEADERBOARD_PERIODS,
  LEADERBOARD_TYPES,
  type LeaderboardPeriod,
  type LeaderboardRow,
  type LeaderboardType,
} from '@trader-sim/shared';
import { leaderboardApi } from '@/api/endpoints';
import { queryKeys } from '@/api/queryClient';
import { useApiErrorMessage } from '@/api/useApiError';
import { useAuthStore } from '@/store/authStore';
import { useUiStore } from '@/store/uiStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { formatLeaderboardValue } from './formatValue';
import { cn } from '@/shared/lib/cn';
import { Button, EmptyState, ErrorState, Select, Skeleton, TabPanel, Tabs } from '@/shared/ui';
import { tableClass, tdClass, thClass } from '@/features/positions';

const PAGE_SIZE = 20;
const ID = 'online-lb';

function Rows({
  type,
  rows,
  highlight,
}: {
  type: LeaderboardType;
  rows: LeaderboardRow[];
  highlight?: string;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const openCommunity = useUiStore((s) => s.openCommunity);
  return (
    <div className="overflow-x-auto">
      <table className={cn(tableClass, '!min-w-0')}>
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, '!text-left')}>
              {t('leaderboard.rank')}
            </th>
            <th scope="col" className={cn(thClass, '!text-left')}>
              {t('online.player')}
            </th>
            <th scope="col" className={cn(thClass, 'hidden sm:table-cell')}>
              {t('online.level')}
            </th>
            <th scope="col" className={thClass}>
              {t(`online.types.${type}`)}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.rank}-${row.nickname}`}
              className={cn(
                'border-t border-border/60',
                row.nickname === highlight ? 'bg-accent/10' : 'hover:bg-surface-2/50',
              )}
              aria-current={row.nickname === highlight ? 'true' : undefined}
            >
              <th scope="row" className={cn(tdClass, '!text-left font-mono')}>
                {row.rank}
              </th>
              <td className={cn(tdClass, '!text-left')}>
                <button
                  type="button"
                  className="font-semibold text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  onClick={() => openCommunity('profile', row.nickname)}
                >
                  {row.nickname}
                </button>
              </td>
              <td className={cn(tdClass, 'hidden text-muted sm:table-cell')}>
                {t(`stats.levels.${row.level}`, { defaultValue: row.level })}
              </td>
              <td className={cn(tdClass, 'font-mono font-semibold')}>
                {formatLeaderboardValue(type, row.value, fmt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MyPosition({
  type,
  period,
  season,
}: {
  type: LeaderboardType;
  period: LeaderboardPeriod;
  season?: string;
}) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const me = useQuery({
    queryKey: queryKeys.leaderboardMe(type, period, season),
    queryFn: () => leaderboardApi.me({ type, period, season }),
    enabled: Boolean(user),
  });
  if (!user || !me.data) return null;
  if (!me.data.me) return <p className="px-3 pb-3 text-xs text-muted">{t('online.notRanked')}</p>;
  return (
    <section aria-label={t('online.myPosition')} className="border-t border-border">
      <h3 className="px-3 pt-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {t('online.myPosition')} · #{me.data.me.rank}
      </h3>
      <Rows
        type={type}
        rows={[...me.data.above, me.data.me, ...me.data.below]}
        highlight={user.nickname}
      />
    </section>
  );
}

/** Paginated global / weekly / season / friends / daily leaderboard. */
export function OnlineLeaderboard({
  initialPeriod = 'all',
}: {
  initialPeriod?: LeaderboardPeriod;
}) {
  const { t } = useTranslation();
  const errorMessage = useApiErrorMessage();
  const user = useAuthStore((s) => s.user);
  const [period, setPeriod] = useState<LeaderboardPeriod>(initialPeriod);
  const [type, setType] = useState<LeaderboardType>('equity');
  const [season, setSeason] = useState<string | undefined>(undefined);

  const seasons = useQuery({
    queryKey: queryKeys.seasons,
    queryFn: leaderboardApi.seasons,
    enabled: period === 'season',
  });
  const friendsLocked = period === 'friends' && !user;
  const board = useInfiniteQuery({
    queryKey: queryKeys.leaderboard(type, period, season),
    queryFn: ({ pageParam }) =>
      leaderboardApi.page({ type, period, season, cursor: pageParam, limit: PAGE_SIZE }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: !friendsLocked,
  });
  const rows = board.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col">
      <Tabs
        items={LEADERBOARD_PERIODS.map((p) => ({ id: p, label: t(`online.periods.${p}`) }))}
        value={period}
        onChange={setPeriod}
        ariaLabel={t('online.periodLabel')}
        idPrefix={ID}
      />
      <TabPanel idPrefix={ID} id={period} className="flex flex-col">
        <div className="flex flex-wrap items-end gap-3 p-3">
          <Select<LeaderboardType>
            label={t('online.metric')}
            value={type}
            onChange={setType}
            options={LEADERBOARD_TYPES.map((v) => ({ value: v, label: t(`online.types.${v}`) }))}
            className="w-48"
          />
          {period === 'season' && seasons.data && (
            <Select
              label={t('online.season')}
              value={season ?? seasons.data.current}
              onChange={(v) => setSeason(v === seasons.data?.current ? undefined : v)}
              options={seasons.data.seasons.map((s) => ({ value: s.key, label: s.key }))}
              className="w-36"
            />
          )}
          <p className="text-[11px] text-muted">{t(`online.typeHints.${type}`)}</p>
        </div>

        {friendsLocked ? (
          <EmptyState icon="🔒" title={t('online.friendsLocked')}>
            <Button
              size="sm"
              variant="primary"
              onClick={() => useUiStore.getState().openAuth('login')}
            >
              {t('auth.signIn')}
            </Button>
          </EmptyState>
        ) : board.isPending ? (
          <Skeleton rows={6} />
        ) : board.isError ? (
          <ErrorState message={errorMessage(board.error)} onRetry={() => void board.refetch()} />
        ) : rows.length === 0 ? (
          <EmptyState icon="🏁" title={t('online.empty')}>
            {t('online.emptyHint')}
          </EmptyState>
        ) : (
          <>
            <Rows type={type} rows={rows} highlight={user?.nickname} />
            {board.hasNextPage && (
              <div className="flex justify-center p-3">
                <Button
                  size="sm"
                  onClick={() => void board.fetchNextPage()}
                  disabled={board.isFetchingNextPage}
                >
                  {board.isFetchingNextPage ? t('common.loading') : t('online.loadMore')}
                </Button>
              </div>
            )}
            <MyPosition type={type} period={period} season={season} />
          </>
        )}
      </TabPanel>
    </div>
  );
}
