import { createContext } from 'react';
import type { ThemeName, ThemePreference } from '@/types';

export interface ThemeContextValue {
  /** What the user picked (may be "system"). */
  preference: ThemePreference;
  /** The theme actually applied. */
  theme: ThemeName;
  setPreference: (preference: ThemePreference) => void;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
