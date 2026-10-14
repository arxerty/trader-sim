import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Position } from '@/types';
import { getAsset } from '@/engine/market';
import { liquidationPrice, notionalValue, pnlPercent, unrealizedPnl } from '@/engine/trading';
import { usePrice } from '@/store/marketStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { closePositionById } from '@/store/game';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { useGuardedCallback } from '@/shared/hooks/useGuardedCallback';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { SideBadge } from './SideBadge';
import { tableClass, tdClass, thClass } from './tableStyles';

const PositionRow = memo(function PositionRow({ position }: { position: Position }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const price = usePrice(position.assetId) ?? position.entryPrice;
  const decimals = getAsset(position.assetId)?.decimals ?? 2;
  const pnl = unrealizedPnl(position, price);
  const pct = pnlPercent(position, price) / 100;
  const close = useGuardedCallback(() => closePositionById(position.id), 500);
  const tone = pnl >= 0 ? 'text-up' : 'text-down';

  return (
    <tr className="border-t border-border/60 hover:bg-surface-2/50">
      <th scope="row" className={cn(tdClass, 'text-left font-semibold')}>
        {getAsset(position.assetId)?.symbol ?? position.assetId}
      </th>
      <td className={tdClass}>
        <SideBadge side={position.side} />
        <span className="ml-1 text-muted">x{position.leverage}</span>
      </td>
      <td className={cn(tdClass, 'font-mono')}>
        {fmt.currency(notionalValue(position.margin, position.leverage))}
      </td>
      <td className={cn(tdClass, 'font-mono')}>{fmt.number(position.entryPrice, decimals)}</td>
      <td className={cn(tdClass, 'font-mono')}>{fmt.number(price, decimals)}</td>
      <td className={cn(tdClass, 'font-mono text-warning')}>
        {fmt.number(
          liquidationPrice(position.side, position.entryPrice, position.leverage),
          decimals,
        )}
      </td>
      <td className={cn(tdClass, 'font-mono text-muted')}>
        {position.stopLoss !== undefined
          ? fmt.number(position.stopLoss, decimals)
          : t('common.notAvailable')}
        {' / '}
        {position.takeProfit !== undefined
          ? fmt.number(position.takeProfit, decimals)
          : t('common.notAvailable')}
      </td>
      <td className={cn(tdClass, 'font-mono font-semibold', tone)}>
        {fmt.signedCurrency(pnl)}
        <span className="ml-1 text-[11px] font-normal">({fmt.percent(pct, true)})</span>
      </td>
      <td className={tdClass}>
        <Button
          size="sm"
          variant="danger"
          onClick={close}
          aria-label={t('trade.closePositionAria', {
            side: t(`trade.${position.side}`),
            asset: t(`assets.${position.assetId}.name`),
          })}
        >
          {t('trade.closePosition')}
        </Button>
      </td>
    </tr>
  );
});

export function PositionsTable() {
  const { t } = useTranslation();
  const positions = usePortfolioStore((s) => s.account.positions);

  if (positions.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('trade.noPositions')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <caption className="sr-only">
          {t('trade.positionsCount', { count: positions.length })}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, 'text-left')}>
              {t('trade.asset')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.side')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.size')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.entry')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.mark')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.liquidationPrice')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.stopLoss')} / {t('trade.takeProfit')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.pnl')}
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">{t('trade.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p) => (
            <PositionRow key={p.id} position={p} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
