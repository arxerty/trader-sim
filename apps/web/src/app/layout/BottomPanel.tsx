import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useUiStore, type BottomPanelTab } from '@/store/uiStore';
import { PositionsTable, OrdersTable } from '@/features/positions';
import { HistoryTable } from '@/features/history';
import { StatsPanel } from '@/features/stats';
import { AchievementsPanel } from '@/features/achievements';
import { LeaderboardTable } from '@/features/leaderboard';
import { TabPanel, Tabs } from '@/shared/ui';

const ID = 'bottom';

/** Desktop tabbed area under the chart. Only the active tab is mounted. */
export function BottomPanel() {
  const { t } = useTranslation();
  const tab = useUiStore((s) => s.bottomTab);
  const setTab = useUiStore((s) => s.setBottomTab);
  const positions = usePortfolioStore((s) => s.account.positions.length);
  const orders = usePortfolioStore((s) => s.account.orders.length);

  const items: { id: BottomPanelTab; label: string; badge?: number }[] = [
    { id: 'positions', label: t('sections.positions'), badge: positions },
    { id: 'orders', label: t('sections.orders'), badge: orders },
    { id: 'history', label: t('sections.history') },
    { id: 'stats', label: t('sections.stats') },
    { id: 'achievements', label: t('sections.achievements') },
    { id: 'leaderboard', label: t('sections.leaderboard') },
  ];

  return (
    <section
      className="flex min-h-0 flex-col rounded border border-border bg-surface"
      aria-label={t(`sections.${tab}`)}
    >
      <Tabs
        items={items}
        value={tab}
        onChange={setTab}
        ariaLabel={t('sections.positions')}
        idPrefix={ID}
        className="px-1"
      />
      <TabPanel idPrefix={ID} id={tab} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'positions' && <PositionsTable />}
        {tab === 'orders' && <OrdersTable />}
        {tab === 'history' && <HistoryTable />}
        {tab === 'stats' && <StatsPanel />}
        {tab === 'achievements' && <AchievementsPanel />}
        {tab === 'leaderboard' && <LeaderboardTable />}
      </TabPanel>
    </section>
  );
}
