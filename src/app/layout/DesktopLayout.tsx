import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settingsStore';
import { AssetList, CandleChart, ChartHeader } from '@/features/chart';
import { OrderPanel } from '@/features/order-panel';
import { NewsFeed } from '@/features/news-feed';
import { Panel } from '@/shared/ui';
import { BottomPanel } from './BottomPanel';

/** Three-column trading terminal: watchlist | chart + tabs | order panel + news. */
export function DesktopLayout() {
  const { t } = useTranslation();
  const assetId = useSettingsStore((s) => s.selectedAssetId);
  return (
    <div className="grid min-h-0 flex-1 grid-cols-[220px_minmax(0,1fr)_300px] gap-2 p-2 xl:grid-cols-[240px_minmax(0,1fr)_320px]">
      <Panel title={t('sections.watchlist')} bodyClassName="overflow-y-auto">
        <AssetList />
      </Panel>

      <div className="grid min-h-0 min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(300px,3fr)_minmax(200px,2fr)] gap-2">
        <section
          className="flex min-h-0 flex-col rounded border border-border bg-surface"
          aria-label={t('common.chartLabel', { asset: t(`assets.${assetId}.name`) })}
        >
          <ChartHeader assetId={assetId} />
          <div className="min-h-0 flex-1">
            <CandleChart assetId={assetId} />
          </div>
        </section>
        <BottomPanel />
      </div>

      {/* On short screens the whole column scrolls; the news list scrolls on its own otherwise. */}
      <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-y-auto">
        <Panel title={t('sections.orderPanel')} className="shrink-0">
          <OrderPanel />
        </Panel>
        <Panel
          title={t('sections.news')}
          className="min-h-[220px] flex-1"
          bodyClassName="overflow-y-auto"
        >
          <NewsFeed />
        </Panel>
      </div>
    </div>
  );
}
