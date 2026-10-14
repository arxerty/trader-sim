import type { MobileScreen } from '@/store/uiStore';

/**
 * Screen "routes" for the mobile layout. The app is a single-screen terminal on
 * desktop, so a router library would be overkill – navigation is UI state.
 */
export const MOBILE_ROUTES: readonly { id: MobileScreen; labelKey: string; icon: string }[] = [
  { id: 'trade', labelKey: 'nav.trade', icon: '📈' },
  { id: 'portfolio', labelKey: 'nav.portfolio', icon: '💼' },
  { id: 'news', labelKey: 'nav.news', icon: '📰' },
  { id: 'progress', labelKey: 'nav.progress', icon: '🏆' },
];
