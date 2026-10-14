import { useTranslation } from 'react-i18next';
import { useUiStore } from '@/store/uiStore';
import { AccountSummaryBar, LevelProgress } from '@/features/stats';
import { GameControls } from '@/features/settings';
import { AccountMenu } from '@/features/auth/AccountMenu';
import { RankedStatus } from '@/features/ranked/RankedStatus';
import { Button } from '@/shared/ui';

export function Header() {
  const { t } = useTranslation();
  const openSettings = useUiStore((s) => s.setSettingsOpen);
  const openCommunity = useUiStore((s) => s.openCommunity);
  return (
    <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface px-3 py-2 lg:px-4">
      <div className="flex items-center gap-2">
        <img src="/favicon.svg" alt="" width={28} height={28} className="rounded" />
        <div className="hidden leading-tight sm:block">
          <p className="text-sm font-bold">{t('common.appName')}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted">{t('common.tagline')}</p>
        </div>
      </div>
      <AccountSummaryBar className="ml-1 lg:ml-6" />
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2 lg:gap-3">
        <div className="hidden 2xl:block">
          <LevelProgress compact />
        </div>
        <RankedStatus />
        <GameControls />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => openCommunity('leaderboard')}
          aria-label={t('community.title')}
        >
          <span aria-hidden="true">🏆</span>
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => openSettings(true)}
          aria-label={t('common.settings')}
        >
          <span aria-hidden="true">⚙</span>
        </Button>
        <AccountMenu />
      </div>
    </header>
  );
}
