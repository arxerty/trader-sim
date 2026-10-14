import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settingsStore';
import { submitOrderForm } from '@/features/order-panel';
import { Onboarding } from '@/features/onboarding';
import { SettingsModal } from '@/features/settings';
import { GameOverModal } from '@/features/stats';
import { useHotkeys } from '@/shared/hooks/useHotkeys';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { Toaster } from '@/shared/ui';
import { GameEventsBridge } from './GameEventsBridge';
import { useGameLoop } from './useGameLoop';
import { DesktopLayout } from './layout/DesktopLayout';
import { MobileLayout } from './layout/MobileLayout';
import { Header } from './layout/Header';
import { Footer } from './layout/Footer';

export function App() {
  const { t } = useTranslation();
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const togglePause = useSettingsStore((s) => s.togglePause);

  useGameLoop();
  useHotkeys({
    KeyB: () => submitOrderForm('long'),
    KeyS: () => submitOrderForm('short'),
    Space: togglePause,
  });

  return (
    <div
      className={
        isDesktop ? 'flex h-screen flex-col overflow-hidden' : 'flex min-h-screen flex-col'
      }
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-[70] focus:rounded focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-contrast"
      >
        {t('common.skipToContent')}
      </a>
      <Header />
      <main id="main" className="flex min-h-0 flex-1 flex-col">
        {isDesktop ? <DesktopLayout /> : <MobileLayout />}
      </main>
      <Footer />

      <GameEventsBridge />
      <Toaster />
      <Onboarding />
      <SettingsModal />
      <GameOverModal />
    </div>
  );
}
