import { useEffect } from 'react';
import { refreshSession } from '@/api/client';
import { useUiStore } from '@/store/uiStore';

/**
 * Restores the session from the refresh cookie on start and handles links
 * from e-mails / OAuth: `?verify=…`, `?reset=…`, `?oauth=success`.
 */
export function useAuthBootstrap(): void {
  useEffect(() => {
    void refreshSession();

    const url = new URL(window.location.href);
    const verify = url.searchParams.get('verify');
    const reset = url.searchParams.get('reset');
    if (verify) useUiStore.getState().openAuth('verify', verify);
    else if (reset) useUiStore.getState().openAuth('reset', reset);
    if (verify || reset || url.searchParams.has('oauth')) {
      ['verify', 'reset', 'oauth'].forEach((p) => url.searchParams.delete(p));
      window.history.replaceState(null, '', url.toString());
    }
  }, []);
}
