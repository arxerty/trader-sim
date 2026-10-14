import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useSettingsStore } from '@/store/settingsStore';
import { useMediaQuery } from '@/shared/hooks/useMediaQuery';
import { ThemeContext } from './themeContext';
import { resolveTheme } from './themes';

const TRANSITION_MS = 320;
const META_COLORS = { light: '#f1f5f9', dark: '#080d18', terminal: '#000000' } as const;

/**
 * Resolves the theme preference (incl. "system" via prefers-color-scheme) and
 * applies it as `data-theme` on <html>; all colours come from CSS variables.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSettingsStore((s) => s.theme);
  const setPreference = useSettingsStore((s) => s.setTheme);
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = resolveTheme(preference, prefersDark);
  const firstRun = useRef(true);

  useEffect(() => {
    const root = document.documentElement;
    const isFirst = firstRun.current;
    firstRun.current = false;
    if (root.dataset.theme === theme) return;
    // Animate only user-initiated switches, not the initial paint.
    if (!isFirst) root.classList.add('theme-transition');
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
    const timer = window.setTimeout(() => root.classList.remove('theme-transition'), TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [theme]);

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
