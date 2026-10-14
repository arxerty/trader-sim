import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetId } from '@/types';
import { getAsset } from '@/engine/market';
import { selectSessionOpen, useMarketStore, usePrice } from '@/store/marketStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { safeDiv } from '@/shared/lib/math';

export const ChartHeader = memo(function ChartHeader({ assetId }: { assetId: AssetId }) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const asset = getAsset(assetId);
  const price = usePrice(assetId) ?? 0;
  const open = useMarketStore(selectSessionOpen(assetId)) ?? price;
  const change = safeDiv(price - open, open);
  const decimals = asset?.decimals ?? 2;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-3 py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-base font-bold">{asset?.symbol}</span>
        <span className="text-sm text-muted">{t(`assets.${assetId}.name`)}</span>
        {asset && (
          <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[10px] uppercase text-muted">
            {t(`categories.${asset.category}`)}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-3 tabular-nums" aria-live="off">
        <span className="font-mono text-lg font-semibold">{fmt.currency(price, decimals)}</span>
        <span className={cn('font-mono text-sm', change >= 0 ? 'text-up' : 'text-down')}>
          {fmt.percent(change, true)}
        </span>
      </div>
    </div>
  );
});
