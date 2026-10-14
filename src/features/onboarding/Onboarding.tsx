import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/store/settingsStore';
import { useUiStore } from '@/store/uiStore';
import { cn } from '@/shared/lib/cn';
import { Button, Modal } from '@/shared/ui';

export const ONBOARDING_STEPS = ['welcome', 'chart', 'order', 'risk'] as const;
const ICONS = ['👋', '📊', '🛒', '🛡️'];

/** 4-step intro. Shown on first launch; can be replayed from settings. */
export function Onboarding() {
  const { t } = useTranslation();
  const completed = useSettingsStore((s) => s.onboardingCompleted);
  const setCompleted = useSettingsStore((s) => s.setOnboardingCompleted);
  const forcedOpen = useUiStore((s) => s.onboardingOpen);
  const setForcedOpen = useUiStore((s) => s.setOnboardingOpen);
  const [step, setStep] = useState(0);
  const open = !completed || forcedOpen;

  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const finish = () => {
    setCompleted(true);
    setForcedOpen(false);
  };

  const key = ONBOARDING_STEPS[step] ?? 'welcome';
  const isLast = step === ONBOARDING_STEPS.length - 1;

  return (
    <Modal
      open={open}
      onClose={finish}
      title={t('onboarding.dialogTitle')}
      description={t('onboarding.stepOf', { current: step + 1, total: ONBOARDING_STEPS.length })}
      footer={
        <div className="flex w-full items-center justify-between gap-2">
          <Button variant="ghost" onClick={finish}>
            {t('common.skip')}
          </Button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button onClick={() => setStep((s) => Math.max(0, s - 1))}>{t('common.back')}</Button>
            )}
            <Button
              variant="primary"
              onClick={() =>
                isLast ? finish() : setStep((s) => Math.min(ONBOARDING_STEPS.length - 1, s + 1))
              }
            >
              {isLast ? t('onboarding.start') : t('common.next')}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col items-center gap-3 py-2 text-center" aria-live="polite">
        <span aria-hidden="true" className="text-5xl">
          {ICONS[step]}
        </span>
        <h3 className="text-xl font-bold">{t(`onboarding.steps.${key}.title`)}</h3>
        <p className="max-w-md text-sm leading-relaxed text-muted">
          {t(`onboarding.steps.${key}.body`)}
        </p>
      </div>
      <ol className="mt-4 flex justify-center gap-2" aria-hidden="true">
        {ONBOARDING_STEPS.map((s, i) => (
          <li
            key={s}
            className={cn('h-1.5 w-8 rounded-full', i <= step ? 'bg-accent' : 'bg-border')}
          />
        ))}
      </ol>
      <p
        role="note"
        className="mt-5 rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning"
      >
        ⚠ {t('common.disclaimer')}
      </p>
    </Modal>
  );
}
