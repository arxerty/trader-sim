import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetId, Side } from '@/types';
import { getAsset } from '@trader-sim/engine';
import {
  FEE_RATE,
  liquidationPrice,
  marginForPercent,
  notionalValue,
  quantityFor,
  tradingFee,
} from '@trader-sim/engine';
import { usePrice } from '@/store/marketStore';
import { useAccountSummary } from '@/store/selectors';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { parseDecimal } from '@trader-sim/engine';
import { useOrderFormStore } from './orderFormStore';

/** Live calculation block. Isolated so price ticks re-render only this part of the form. */
export const OrderPreview = memo(function OrderPreview({ assetId }: { assetId: AssetId }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const marketPrice = usePrice(assetId) ?? 0;
  const { freeMargin } = useAccountSummary();
  const { type, amount, percent, leverage, limitPrice } = useOrderFormStore();
  const decimals = getAsset(assetId)?.decimals ?? 2;

  const price = type === 'limit' ? (parseDecimal(limitPrice) ?? marketPrice) : marketPrice;
  const margin =
    percent !== null
      ? marginForPercent(freeMargin, percent, leverage)
      : (parseDecimal(amount) ?? 0);
  const notional = notionalValue(Math.max(0, margin), leverage);
  const liq = (side: Side) =>
    price > 0 ? fmt.currency(liquidationPrice(side, price, leverage), decimals) : '—';

  const rows: Array<[string, string]> = [
    [t('trade.price'), fmt.currency(marketPrice, decimals)],
    [t('trade.freeMargin'), fmt.currency(freeMargin)],
    [t('trade.notional'), fmt.currency(notional)],
    [t('trade.quantity'), fmt.quantity(quantityFor(Math.max(0, margin), leverage, price))],
    [t('trade.fee', { rate: fmt.percent(FEE_RATE, false, 1) }), fmt.currency(tradingFee(notional))],
    [
      `${t('trade.liquidationPrice')} (${t('trade.long')} / ${t('trade.short')})`,
      `${liq('long')} / ${liq('short')}`,
    ],
  ];

  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded bg-surface-2 p-2.5 text-xs">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right font-mono tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
});
