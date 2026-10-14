import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PendingOrder } from '@/types';
import { getAsset } from '@/engine/market';
import { notionalValue } from '@/engine/trading';
import { usePortfolioStore } from '@/store/portfolioStore';
import { cancelOrderById } from '@/store/game';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { useGuardedCallback } from '@/shared/hooks/useGuardedCallback';
import { cn } from '@/shared/lib/cn';
import { Button } from '@/shared/ui';
import { SideBadge } from './SideBadge';
import { tableClass, tdClass, thClass } from './tableStyles';

const OrderRow = memo(function OrderRow({ order }: { order: PendingOrder }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const decimals = getAsset(order.assetId)?.decimals ?? 2;
  const cancel = useGuardedCallback(() => cancelOrderById(order.id), 500);
  const na = t('common.notAvailable');

  return (
    <tr className="border-t border-border/60 hover:bg-surface-2/50">
      <th scope="row" className={cn(tdClass, 'text-left font-semibold')}>
        {getAsset(order.assetId)?.symbol ?? order.assetId}
      </th>
      <td className={tdClass}>
        <SideBadge side={order.side} />
        <span className="ml-1 text-muted">x{order.leverage}</span>
      </td>
      <td className={cn(tdClass, 'font-mono')}>{fmt.number(order.limitPrice, decimals)}</td>
      <td className={cn(tdClass, 'font-mono')}>
        {fmt.currency(notionalValue(order.margin, order.leverage))}
      </td>
      <td className={cn(tdClass, 'font-mono text-muted')}>
        {order.stopLoss !== undefined ? fmt.number(order.stopLoss, decimals) : na}
        {' / '}
        {order.takeProfit !== undefined ? fmt.number(order.takeProfit, decimals) : na}
      </td>
      <td className={tdClass}>
        <Button
          size="sm"
          variant="ghost"
          onClick={cancel}
          aria-label={t('trade.cancelOrderAria', { asset: t(`assets.${order.assetId}.name`) })}
        >
          {t('trade.cancelOrder')}
        </Button>
      </td>
    </tr>
  );
});

export function OrdersTable() {
  const { t } = useTranslation();
  const orders = usePortfolioStore((s) => s.account.orders);

  if (orders.length === 0) {
    return <p className="p-6 text-center text-sm text-muted">{t('trade.noOrders')}</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className={tableClass}>
        <thead>
          <tr>
            <th scope="col" className={cn(thClass, 'text-left')}>
              {t('trade.asset')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.side')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.limitPrice')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.size')}
            </th>
            <th scope="col" className={thClass}>
              {t('trade.stopLoss')} / {t('trade.takeProfit')}
            </th>
            <th scope="col" className={thClass}>
              <span className="sr-only">{t('trade.actions')}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <OrderRow key={o.id} order={o} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
