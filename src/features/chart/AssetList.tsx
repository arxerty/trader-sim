import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AssetDefinition } from '@/types';
import { ASSETS } from '@/engine/market';
import { selectSessionOpen, useMarketStore, usePrice } from '@/store/marketStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useFormatters } from '@/shared/hooks/useFormatters';
import { cn } from '@/shared/lib/cn';
import { safeDiv } from '@/shared/lib/math';
import { Select } from '@/shared/ui';

/** One watchlist row; subscribes only to its own asset's price. */
const AssetRow = memo(function AssetRow({
  asset,
  selected,
}: {
  asset: AssetDefinition;
  selected: boolean;
}) {
  const { t } = useTranslation();
  const fmt = useFormatters();
  const selectAsset = useSettingsStore((s) => s.selectAsset);
  const price = usePrice(asset.id) ?? 0;
  const open = useMarketStore(selectSessionOpen(asset.id)) ?? price;
  const change = safeDiv(price - open, open);

  const prev = useRef(price);
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  useEffect(() => {
    if (price === prev.current) return;
    setFlash(price > prev.current ? 'up' : 'down');
    prev.current = price;
    const timer = window.setTimeout(() => setFlash(null), 350);
    return () => window.clearTimeout(timer);
  }, [price]);

  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={() => selectAsset(asset.id)}
        className={cn(
          'grid w-full grid-cols-[1fr_auto] items-center gap-x-2 border-l-2 px-3 py-2 text-left transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
          selected ? 'border-l-accent bg-surface-2' : 'border-l-transparent hover:bg-surface-2/60',
        )}
      >
        <span className="text-sm font-semibold">{asset.symbol}</span>
        <span
          className={cn(
            'rounded px-1 font-mono text-sm tabular-nums transition-colors',
            flash === 'up' && 'bg-up/15 text-up',
            flash === 'down' && 'bg-down/15 text-down',
          )}
        >
          {fmt.number(price, asset.decimals)}
        </span>
        <span className="truncate text-xs text-muted">{t(`assets.${asset.id}.name`)}</span>
        <span
          className={cn(
            'text-right font-mono text-xs tabular-nums',
            change >= 0 ? 'text-up' : 'text-down',
          )}
        >
          {fmt.percent(change, true)}
        </span>
      </button>
    </li>
  );
});

export function AssetList() {
  const selectedId = useSettingsStore((s) => s.selectedAssetId);
  return (
    <ul className="divide-y divide-border/60">
      {ASSETS.map((asset) => (
        <AssetRow key={asset.id} asset={asset} selected={asset.id === selectedId} />
      ))}
    </ul>
  );
}

/** Compact dropdown variant for small screens. */
export function AssetSelect() {
  const { t } = useTranslation();
  const selectedId = useSettingsStore((s) => s.selectedAssetId);
  const selectAsset = useSettingsStore((s) => s.selectAsset);
  return (
    <Select
      label={t('trade.selectAsset')}
      hideLabel
      value={selectedId}
      onChange={selectAsset}
      options={ASSETS.map((a) => ({
        value: a.id,
        label: `${a.symbol} · ${t(`assets.${a.id}.name`)}`,
      }))}
    />
  );
}
