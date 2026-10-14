import { create } from 'zustand';

export type MobileScreen = 'trade' | 'portfolio' | 'news' | 'progress';
export type BottomPanelTab =
  'positions' | 'orders' | 'history' | 'stats' | 'achievements' | 'leaderboard';

/** Transient UI state (not persisted). */
interface UiState {
  mobileScreen: MobileScreen;
  bottomTab: BottomPanelTab;
  settingsOpen: boolean;
  onboardingOpen: boolean;
  setMobileScreen: (screen: MobileScreen) => void;
  setBottomTab: (tab: BottomPanelTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()((set) => ({
  mobileScreen: 'trade',
  bottomTab: 'positions',
  settingsOpen: false,
  onboardingOpen: false,
  setMobileScreen: (mobileScreen) => set({ mobileScreen }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
}));
