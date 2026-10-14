import { useTranslation } from 'react-i18next';

export function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border bg-surface px-4 py-1.5 text-[11px] text-muted">
      <p role="note">⚠ {t('common.disclaimer')}</p>
      <p className="hidden lg:block">{t('common.hotkeysHint')}</p>
    </footer>
  );
}
