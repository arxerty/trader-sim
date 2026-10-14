import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { computeStats } from '@trader-sim/engine';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useAccountSummary } from '@/store/selectors';
import { restartGame } from '@/store/game';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { Button, Modal } from '@/shared/ui';
import { StatCard } from './StatCard';
import { toneOf } from './tone';

/** Bankruptcy summary – cannot be dismissed, only restarted. */
export function GameOverModal() {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const bankrupt = usePortfolioStore((s) => s.bankrupt);
  const trades = usePortfolioStore((s) => s.account.trades);
  const equityHistory = usePortfolioStore((s) => s.equityHistory);
  const summary = useAccountSummary();
  const stats = useMemo(() => computeStats(trades, equityHistory), [trades, equityHistory]);
  const na = t('common.notAvailable');

  return (
    <Modal
      open={bankrupt}
      onClose={() => undefined}
      dismissible={false}
      title={<span className="text-down">{t('gameOver.title')}</span>}
      description={t('gameOver.body')}
      footer={
        <Button variant="primary" size="lg" onClick={() => restartGame()}>
          {t('common.restart')}
        </Button>
      }
    >
      <dl className="grid grid-cols-2 gap-2">
        <StatCard
          label={t('gameOver.finalEquity')}
          value={fmt.currency(Math.max(0, summary.equity))}
        />
        <StatCard label={t('stats.totalTrades')} value={fmt.number(stats.totalTrades, 0)} />
        <StatCard label={t('stats.winRate')} value={fmt.percent(stats.winRate, false, 1)} />
        <StatCard
          label={t('stats.maxDrawdown')}
          value={fmt.percent(stats.maxDrawdown, false, 1)}
          tone="down"
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
      </dl>
      <p className="mt-4 text-xs text-muted">{t('common.disclaimer')}</p>
    </Modal>
  );
}
