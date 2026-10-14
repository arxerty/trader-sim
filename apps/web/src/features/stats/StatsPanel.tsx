import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeStats } from '@trader-sim/engine';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useAccountSummary } from '@/store/selectors';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { LevelProgress } from './LevelProgress';
import { StatCard } from './StatCard';
import { toneOf } from './tone';

export function StatsPanel() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const summary = useAccountSummary();
  const trades = usePortfolioStore((s) => s.account.trades);
  const equityHistory = usePortfolioStore((s) => s.equityHistory);
  // Recomputed only when trades or the sampled equity curve change, not on every tick.
  const stats = useMemo(() => computeStats(trades, equityHistory), [trades, equityHistory]);
  const na = t('common.notAvailable');

  return (
    <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_240px]">
      <div className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('stats.equity')} value={fmt.currency(summary.equity)} />
          <StatCard label={t('stats.balance')} value={fmt.currency(summary.balance)} />
          <StatCard label={t('stats.usedMargin')} value={fmt.currency(summary.usedMargin)} />
          <StatCard label={t('stats.freeMargin')} value={fmt.currency(summary.freeMargin)} />
          <StatCard
            label={t('stats.unrealizedPnl')}
            value={fmt.signedCurrency(summary.unrealizedPnl)}
            tone={toneOf(summary.unrealizedPnl)}
          />
          <StatCard
            label={t('stats.realizedPnl')}
            value={fmt.signedCurrency(summary.realizedPnl)}
            tone={toneOf(summary.realizedPnl)}
          />
          <StatCard
            label={t('stats.marginLevel')}
            value={
              summary.marginLevel === null ? na : fmt.percent(summary.marginLevel / 100, false, 0)
            }
          />
          <StatCard
            label={t('stats.totalFees')}
            value={fmt.currency(summary.totalFees)}
            tone="muted"
          />
        </dl>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard label={t('stats.totalTrades')} value={fmt.number(stats.totalTrades, 0)} />
          <StatCard label={t('stats.winsLosses')} value={`${stats.wins} / ${stats.losses}`} />
          <StatCard label={t('stats.winRate')} value={fmt.percent(stats.winRate, false, 1)} />
          <StatCard
            label={t('stats.longestStreak')}
            value={fmt.number(stats.longestWinStreak, 0)}
          />
          <StatCard
            label={t('stats.bestTrade')}
            value={stats.bestTrade === null ? na : fmt.signedCurrency(stats.bestTrade)}
            tone={toneOf(stats.bestTrade)}
          />
          <StatCard
            label={t('stats.worstTrade')}
            value={stats.worstTrade === null ? na : fmt.signedCurrency(stats.worstTrade)}
            tone={toneOf(stats.worstTrade)}
          />
          <StatCard
            label={t('stats.averagePnl')}
            value={stats.totalTrades ? fmt.signedCurrency(stats.averagePnl) : na}
            tone={toneOf(stats.averagePnl)}
          />
          <StatCard
            label={t('stats.maxDrawdown')}
            value={fmt.percent(stats.maxDrawdown, false, 1)}
            tone={stats.maxDrawdown > 0 ? 'down' : null}
          />
        </dl>
      </div>
      <LevelProgress />
    </div>
  );
}
