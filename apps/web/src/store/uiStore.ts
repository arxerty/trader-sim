import { create } from 'zustand';

export type MobileScreen = 'trade' | 'portfolio' | 'news' | 'progress';
export type BottomPanelTab =
  'positions' | 'orders' | 'history' | 'stats' | 'achievements' | 'leaderboard';
export type AuthView = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
export type CommunityTab = 'leaderboard' | 'daily' | 'friends' | 'profile';

/** Transient UI state (not persisted). */
interface UiState {
  mobileScreen: MobileScreen;
  bottomTab: BottomPanelTab;
  settingsOpen: boolean;
  onboardingOpen: boolean;
  /** Auth dialog: null = closed. `token` carries ?verify / ?reset link tokens. */
  auth: { view: AuthView; token?: string } | null;
  community: { tab: CommunityTab; nickname?: string } | null;
  setMobileScreen: (screen: MobileScreen) => void;
  setBottomTab: (tab: BottomPanelTab) => void;
  setSettingsOpen: (open: boolean) => void;
  setOnboardingOpen: (open: boolean) => void;
  openAuth: (view: AuthView, token?: string) => void;
  closeAuth: () => void;
  /** Opens the community dialog; `nickname` shows that player's public profile. */
  openCommunity: (tab: CommunityTab, nickname?: string) => void;
  closeCommunity: () => void;
}

export const useUiStore = create<UiState>()((set) => ({
  mobileScreen: 'trade',
  bottomTab: 'positions',
  settingsOpen: false,
  onboardingOpen: false,
  auth: null,
  community: null,
  setMobileScreen: (mobileScreen) => set({ mobileScreen }),
  setBottomTab: (bottomTab) => set({ bottomTab }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setOnboardingOpen: (onboardingOpen) => set({ onboardingOpen }),
  openAuth: (view, token) => set({ auth: token ? { view, token } : { view } }),
  closeAuth: () => set({ auth: null }),
  openCommunity: (tab, nickname) => set({ community: nickname ? { tab, nickname } : { tab } }),
  closeCommunity: () => set({ community: null }),
}));
