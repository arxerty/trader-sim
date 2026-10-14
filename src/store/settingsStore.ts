import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AssetId, GameSpeed, ThemePreference } from '@/types';
import { createSafeStorage } from './persistence/safeStorage';
import {
  DEFAULT_SETTINGS,
  sanitizeSettings,
  SCHEMA_VERSIONS,
  STORAGE_KEYS,
  type SettingsData,
} from './persistence/migrations';

export interface SettingsState extends SettingsData {
  /** Runtime only – the game always starts unpaused. */
  paused: boolean;
  setTheme: (theme: ThemePreference) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setVolume: (volume: number) => void;
  setSpeed: (speed: GameSpeed) => void;
  setPaused: (paused: boolean) => void;
  togglePause: () => void;
  selectAsset: (assetId: AssetId) => void;
  setOnboardingCompleted: (done: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_SETTINGS,
      paused: false,
      setTheme: (theme) => set({ theme }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setVolume: (volume) => set({ volume: Math.min(1, Math.max(0, volume)) }),
      setSpeed: (speed) => set({ speed }),
      setPaused: (paused) => set({ paused }),
      togglePause: () => set((s) => ({ paused: !s.paused })),
      selectAsset: (selectedAssetId) => set({ selectedAssetId }),
      setOnboardingCompleted: (onboardingCompleted) => set({ onboardingCompleted }),
    }),
    {
      name: STORAGE_KEYS.settings,
      version: SCHEMA_VERSIONS.settings,
      storage: createSafeStorage<SettingsData>(),
      partialize: ({
        theme,
        soundEnabled,
        volume,
        speed,
        selectedAssetId,
        onboardingCompleted,
      }) => ({
        theme,
        soundEnabled,
        volume,
        speed,
        selectedAssetId,
        onboardingCompleted,
      }),
      migrate: (persisted) => sanitizeSettings(persisted),
      merge: (persisted, current) =>
        persisted === undefined ? current : { ...current, ...sanitizeSettings(persisted) },
    },
  ),
);
