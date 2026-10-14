import { useEffect } from 'react';
import { runTick } from '@/store/game';
import { usePortfolioStore } from '@/store/portfolioStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { useDocumentVisible } from '@/shared/hooks/useDocumentVisible';

/** Real milliseconds per tick at 1× speed. */
export const BASE_TICK_MS = 1000;

/**
 * Drives the simulation. The interval is torn down (not just skipped) while
 * paused, bankrupt, onboarding is open or the tab is hidden, so a background
 * tab never accumulates a burst of catch-up ticks.
 */
export function useGameLoop(): void {
  const paused = useSettingsStore((s) => s.paused);
  const speed = useSettingsStore((s) => s.speed);
  const onboardingDone = useSettingsStore((s) => s.onboardingCompleted);
  const onboardingOpen = useUiStore((s) => s.onboardingOpen);
  const bankrupt = usePortfolioStore((s) => s.bankrupt);
  const visible = useDocumentVisible();

  const running = !paused && !bankrupt && visible && onboardingDone && !onboardingOpen;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      try {
        runTick();
      } catch (error) {
        console.error('Game tick failed', error);
      }
    }, BASE_TICK_MS / speed);
    return () => window.clearInterval(id);
  }, [running, speed]);
}
