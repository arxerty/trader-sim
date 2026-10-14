import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { restartGame } from '@/store/game';
import { useAuthStore } from '@/store/authStore';
import { startRankedRun } from '@/features/ranked/rankedService';
import { Button, Modal, Switch } from '@/shared/ui';
import { SpeedControl } from './GameControls';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

export function SettingsModal() {
  const { t } = useTranslation();
  const open = useUiStore((s) => s.settingsOpen);
  const setOpen = useUiStore((s) => s.setSettingsOpen);
  const setOnboardingOpen = useUiStore((s) => s.setOnboardingOpen);
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSoundEnabled = useSettingsStore((s) => s.setSoundEnabled);
  const volume = useSettingsStore((s) => s.volume);
  const setVolume = useSettingsStore((s) => s.setVolume);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const volumeId = useId();

  const close = () => setOpen(false);

  return (
    <>
      <Modal open={open && !confirmOpen} onClose={close} title={t('common.settings')}>
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <ThemeSwitcher />
            <LanguageSwitcher />
          </div>

          <div className="flex flex-col gap-2">
            <Switch label={t('settings.sound')} checked={soundEnabled} onChange={setSoundEnabled} />
            <div className="flex items-center gap-3">
              <label htmlFor={volumeId} className="w-24 shrink-0 text-xs text-muted">
                {t('settings.volume')}
              </label>
              <input
                id={volumeId}
                type="range"
                min={0}
                max={100}
                step={5}
                value={Math.round(volume * 100)}
                disabled={!soundEnabled}
                onChange={(e) => setVolume(Number(e.target.value) / 100)}
                className="w-full accent-[rgb(var(--color-accent))] disabled:opacity-40"
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{t('settings.speed')}</span>
            <SpeedControl size="md" />
          </div>

          <section aria-labelledby={`${volumeId}-keys`}>
            <h3
              id={`${volumeId}-keys`}
              className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted"
            >
              {t('settings.keyboard')}
            </h3>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              {(
                [
                  ['B', 'settings.keys.buy'],
                  ['S', 'settings.keys.sell'],
                  [t('settings.keys.space'), 'settings.keys.pause'],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="contents">
                  <dt>
                    <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs">
                      {key}
                    </kbd>
                  </dt>
                  <dd className="text-muted">{t(label)}</dd>
                </div>
              ))}
            </dl>
          </section>

          <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
            <Button
              fullWidth
              onClick={() => {
                close();
                setOnboardingOpen(true);
              }}
            >
              {t('settings.replayTutorial')}
            </Button>
            <Button fullWidth variant="danger" onClick={() => setConfirmOpen(true)}>
              {t('settings.newGame')}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="sm"
        title={t('settings.newGameTitle')}
        description={t('settings.newGameBody')}
        footer={
          <>
            <Button onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={() => {
                // Signed-in players start a new ranked run; guests a local session.
                if (useAuthStore.getState().user) {
                  void startRankedRun('standard').catch(() => restartGame());
                } else {
                  restartGame();
                }
                setConfirmOpen(false);
                close();
              }}
            >
              {t('common.restart')}
            </Button>
          </>
        }
      />
    </>
  );
}
