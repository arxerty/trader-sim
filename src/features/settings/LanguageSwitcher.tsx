import { useTranslation } from 'react-i18next';
import { resolveLanguage, SUPPORTED_LANGUAGES, type LanguageCode } from '@/i18n';
import { Select } from '@/shared/ui';

/** Switches language instantly; the detector caches the choice in localStorage. */
export function LanguageSwitcher({ hideLabel = false }: { hideLabel?: boolean }) {
  const { t, i18n } = useTranslation();
  const current = resolveLanguage(i18n.resolvedLanguage ?? i18n.language);
  return (
    <Select<LanguageCode>
      label={t('settings.language')}
      hideLabel={hideLabel}
      value={current}
      onChange={(lng) => void i18n.changeLanguage(lng)}
      options={SUPPORTED_LANGUAGES.map((value) => ({
        value,
        label: t(`settings.languages.${value}`),
      }))}
    />
  );
}
