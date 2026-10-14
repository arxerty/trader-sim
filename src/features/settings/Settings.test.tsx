import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from '@/i18n';
import { useSettingsStore } from '@/store/settingsStore';
import { ThemeProvider } from '@/theme/ThemeProvider';
import { STORAGE_KEYS } from '@/store/persistence/migrations';
import { LanguageSwitcher } from './LanguageSwitcher';
import { ThemeSwitcher } from './ThemeSwitcher';

describe('<LanguageSwitcher />', () => {
  afterEach(async () => {
    await act(() => i18n.changeLanguage('en'));
  });

  it('switches the UI language instantly', async () => {
    const user = userEvent.setup();
    render(<LanguageSwitcher />);
    await user.selectOptions(screen.getByLabelText('Language'), 'ru');
    expect(i18n.language).toBe('ru');
    expect(await screen.findByLabelText('Язык')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('ru');
  });

  it('lists every supported language by its native name', () => {
    render(<LanguageSwitcher />);
    const names = screen.getAllByRole('option').map((o) => o.textContent);
    expect(names).toEqual(['English', 'Русский', 'Español', '中文', 'Українська', 'Deutsch']);
  });
});

describe('<ThemeSwitcher />', () => {
  beforeEach(() => {
    useSettingsStore.getState().setTheme('system');
    delete document.documentElement.dataset.theme;
  });

  it('applies and persists the chosen theme', async () => {
    const user = userEvent.setup();
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );
    await user.selectOptions(screen.getByLabelText('Theme'), 'dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem(STORAGE_KEYS.settings)).toContain('"theme":"dark"');

    await user.selectOptions(screen.getByLabelText('Theme'), 'terminal');
    expect(document.documentElement.dataset.theme).toBe('terminal');
  });

  it('follows prefers-color-scheme in system mode', () => {
    render(
      <ThemeProvider>
        <ThemeSwitcher />
      </ThemeProvider>,
    );
    // The jsdom matchMedia stub reports no dark preference.
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByLabelText('Theme')).toHaveValue('system');
  });
});
