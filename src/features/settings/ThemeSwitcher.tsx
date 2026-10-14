import { useTranslation } from 'react-i18next';
import type { ThemePreference } from '@/types';
import { THEME_PREFERENCES } from '@/theme/themes';
import { useTheme } from '@/theme/useTheme';
import { Select } from '@/shared/ui';

export function ThemeSwitcher({ hideLabel = false }: { hideLabel?: boolean }) {
  const { t } = useTranslation();
  const { preference, setPreference } = useTheme();
  return (
    <Select<ThemePreference>
      label={t('settings.theme')}
      hideLabel={hideLabel}
      value={preference}
      onChange={setPreference}
      options={THEME_PREFERENCES.map((value) => ({ value, label: t(`settings.themes.${value}`) }))}
    />
  );
}
