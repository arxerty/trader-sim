import { useTranslation } from 'react-i18next';
import type { GameSpeed } from '@/types';
import { useSettingsStore } from '@/store/settingsStore';
import { usePortfolioStore } from '@/store/portfolioStore';
import { Button, Segmented, Tooltip } from '@/shared/ui';

const SPEEDS: readonly GameSpeed[] = [1, 2, 5];

export function SpeedControl({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const speed = useSettingsStore((s) => s.speed);
  const setSpeed = useSettingsStore((s) => s.setSpeed);
  return (
    <Segmented<GameSpeed>
      label={t('common.speed')}
      size={size}
      value={speed}
      onChange={setSpeed}
      className="w-28"
      options={SPEEDS.map((s) => ({ value: s, label: t('common.speedValue', { value: s }) }))}
    />
  );
}

/** Pause/resume + speed. Space toggles pause globally. */
export function GameControls() {
  const { t } = useTranslation();
  const paused = useSettingsStore((s) => s.paused);
  const togglePause = useSettingsStore((s) => s.togglePause);
  const bankrupt = usePortfolioStore((s) => s.bankrupt);
  return (
    <div className="flex items-center gap-2">
      <Tooltip
        content={`${paused ? t('common.resume') : t('common.pause')} (${t('settings.keys.space')})`}
        side="bottom"
      >
        <Button
          size="icon"
          variant={paused ? 'primary' : 'secondary'}
          onClick={togglePause}
          disabled={bankrupt}
          aria-pressed={paused}
          aria-keyshortcuts="Space"
          aria-label={paused ? t('common.resume') : t('common.pause')}
        >
          <span aria-hidden="true">{paused ? '▶' : '⏸'}</span>
        </Button>
      </Tooltip>
      <span className="hidden items-center gap-1.5 text-xs text-muted sm:flex" aria-live="polite">
        <span
          aria-hidden="true"
          className={
            paused ? 'h-2 w-2 rounded-full bg-warning' : 'h-2 w-2 animate-pulse rounded-full bg-up'
          }
        />
        {paused ? t('common.paused') : t('common.live')}
      </span>
      <SpeedControl />
    </div>
  );
}
