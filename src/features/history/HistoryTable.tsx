import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { ClosedTrade } from '@/types';
import { getAsset } from '@/engine/market';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { SideBadge, tableClass, tdClass, thClass } from '@/features/positions';

const MAX_ROWS = 100;

const TradeRow = memo(function TradeRow({ trade }: { trade: ClosedTrade }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const decimals = getAsset(trade.assetId)?.decimals ?? 2;
  return (
    <tr className="border-t border-border/60 hover:bg-surface-2/50">
      <td className={cn(tdClass, 'text-left font-mono text-muted')}>{fmt.time(trade.closedAt)}</td>
      <th scope="row" className={cn(tdClass, 'font-semibold')}>
        {getAsset(trade.assetId)?.symbol ?? trade.assetId}
      </th>
      <td className={tdClass}>
        <SideBadge side={trade.side} />
        <span className="ml-1 text-muted">x{trade.leverage}</span>
      </td>
      <td className={cn(tdClass, 'font-mono')}>{fmt.number(trade.entryPrice, decimals)}</td>
      <td className={cn(tdClass, 'font-mono')}>{fmt.number(trade.exitPrice, decimals)}</td>
      <td
        className={cn(tdClass, 'font-mono font-semibold', trade.pnl >= 0 ? 'text-up' : 'text-down')}
      >
        {fmt.signedCurrency(trade.pnl)}
      </td>
      <td className={cn(tdClass, trade.reason === 'liquidation' ? 'text-warning' : 'text-muted')}>
        {t(`trade.reasons.${trade.reason}`)}
      </td>
    </tr>
  );
});

export function HistoryTable() {
  const { t } = useTranslation();
  const trades = usePortfolioStore((s) => s.account.trades);
  const recent = useMemo(() => trades.slice(-MAX_ROWS).reverse(), [trades]);

  if (recent.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('trade.noHistory')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <caption className="sr-only">{t('trade.tradesCount', { count: trades.length })}</caption>
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, 'text-left')}>
              {t('trade.time')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.asset')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.side')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.entry')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.exit')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.pnl')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.reason')}
            </th>
          </tr>
        </thead>
        <tbody>
          {recent.map((trade) => (
            <TradeRow key={trade.id} trade={trade} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
