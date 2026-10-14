import type { ThemeName, ThemePreference } from '@/types';

export const THEMES: readonly ThemeName[] = ['light', 'dark', 'terminal'];
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', ...THEMES];

export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ThemeName {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

/** Reads a theme token ("R G B") from CSS and returns a canvas-friendly colour string. */
export function readCssColor(
  name: string,
  alpha = 1,
  element: Element = document.documentElement,
): string {
  const raw = getComputedStyle(element).getPropertyValue(name).trim();
  const parts = raw
    .split(/[\s,]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n)))
    return alpha < 1 ? `rgba(128, 128, 128, ${alpha})` : 'rgb(128, 128, 128)';
  const [r, g, b] = parts;
  return alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${alpha})` : `rgb(${r}, ${g}, ${b})`;
}
