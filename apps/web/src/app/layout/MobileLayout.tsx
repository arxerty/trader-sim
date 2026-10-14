import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { AssetSelect, CandleChart, ChartHeader } from '@/features/chart';
import { OrderPanel } from '@/features/order-panel';
import { OrdersTable, PositionsTable } from '@/features/positions';
import { HistoryTable } from '@/features/history';
import { NewsFeed } from '@/features/news-feed';
import { StatsPanel } from '@/features/stats';
import { AchievementsPanel } from '@/features/achievements';
import { LeaderboardTable } from '@/features/leaderboard';
import { cn } from '@/shared/lib/cn';
import { Panel } from '@/shared/ui';
import { MOBILE_ROUTES } from '../routes';

function BottomNav() {
  const { t } = useTranslation();
  const screen = useUiStore((s) => s.mobileScreen);
  const setScreen = useUiStore((s) => s.setMobileScreen);
  const positions = usePortfolioStore((s) => s.account.positions.length);
  return (
    <nav
      aria-label={t('common.mainNavigation')}
      className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      {MOBILE_ROUTES.map((route) => {
        const active = route.id === screen;
        return (
          <button
            key={route.id}
            type="button"
            onClick={() => setScreen(route.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'relative flex flex-col items-center gap-0.5 py-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent',
              active ? 'text-accent' : 'text-muted',
            )}
          >
            <span aria-hidden="true" className="text-lg leading-none">
              {route.icon}
            </span>
            {t(route.labelKey)}
            {route.id === 'portfolio' && positions > 0 && (
              <span className="absolute right-[28%] top-1 rounded-full bg-accent px-1 text-[9px] font-bold text-accent-contrast">
                {positions}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

export function MobileLayout() {
  const { t } = useTranslation();
  const screen = useUiStore((s) => s.mobileScreen);
  const assetId = useSettingsStore((s) => s.selectedAssetId);

  return (
    <>
      <div className="flex flex-1 flex-col gap-2 p-2">
        {screen === 'trade' && (
          <>
            <AssetSelect />
            <section className="flex h-[46vh] min-h-[280px] flex-col rounded border border-border bg-surface">
              <ChartHeader assetId={assetId} />
              <div className="min-h-0 flex-1">
                <CandleChart assetId={assetId} />
              </div>
            </section>
            <Panel title={t('sections.orderPanel')}>
              <OrderPanel />
            </Panel>
          </>
        )}
        {screen === 'portfolio' && (
          <>
            <Panel title={t('sections.positions')}>
              <PositionsTable />
            </Panel>
            <Panel title={t('sections.orders')}>
              <OrdersTable />
            </Panel>
            <Panel title={t('sections.history')}>
              <HistoryTable />
            </Panel>
          </>
        )}
        {screen === 'news' && (
          <Panel title={t('sections.news')}>
            <NewsFeed />
          </Panel>
        )}
        {screen === 'progress' && (
          <>
            <Panel title={t('sections.stats')}>
              <StatsPanel />
            </Panel>
            <Panel title={t('sections.achievements')}>
              <AchievementsPanel />
            </Panel>
            <Panel title={t('sections.leaderboard')}>
              <LeaderboardTable />
            </Panel>
          </>
        )}
      </div>
      <BottomNav />
    </>
  );
}
