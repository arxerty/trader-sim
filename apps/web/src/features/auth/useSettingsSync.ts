import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CloudSettings, SettingsSync } from '@trader-sim/shared';
import { isApiError } from '@/api/client';
import { meApi } from '@/api/endpoints';
import { resolveLanguage } from '@/i18n';
import { useAuthStore } from '@/store/authStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useSyncStore } from '@/store/syncStore';

const PUSH_DEBOUNCE_MS = 1500;

function localSettings(language: string): CloudSettings {
  const s = useSettingsStore.getState();
  return {
    locale: resolveLanguage(language),
    theme: s.theme,
    soundEnabled: s.soundEnabled,
    volume: s.volume,
    speed: s.speed,
  };
}

/**
 * Cloud sync of client settings (language, theme, sound, speed).
 * Conflicts are resolved by recency: whichever side changed last wins; the
 * server's version number guards against blind overwrites (409 VERSION_CONFLICT).
 */
export function useSettingsSync(): void {
  const { i18n } = useTranslation();
  const status = useAuthStore((s) => s.status);
  const applying = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    let timer: number | undefined;

    const apply = (remote: SettingsSync) => {
      applying.current = true;
      const s = useSettingsStore.getState();
      s.setTheme(remote.settings.theme);
      s.setSoundEnabled(remote.settings.soundEnabled);
      s.setVolume(remote.settings.volume);
      s.setSpeed(remote.settings.speed);
      void i18n.changeLanguage(remote.settings.locale);
      useSyncStore.getState().setSettingsVersion(remote.version);
      applying.current = false;
    };

    const push = async () => {
      const sync = useSyncStore.getState();
      try {
        const saved = await meApi.putSettings(localSettings(i18n.language), sync.settingsVersion);
        sync.setSettingsVersion(saved.version);
      } catch (e) {
        if (isApiError(e) && e.code === 'VERSION_CONFLICT') {
          const remote = e.details as SettingsSync;
          // Newer change wins: local edits after the server copy are re-applied on top of it.
          if (new Date(remote.updatedAt).getTime() > sync.localChangedAt) apply(remote);
          else {
            sync.setSettingsVersion(remote.version);
            void push();
          }
        }
      }
    };

    void (async () => {
      try {
        const remote = await meApi.settings();
        if (cancelled) return;
        const sync = useSyncStore.getState();
        if (remote.version === 0) await push();
        else if (new Date(remote.updatedAt).getTime() >= sync.localChangedAt) apply(remote);
        else {
          sync.setSettingsVersion(remote.version);
          await push();
        }
      } catch {
        /* offline – local settings keep working */
      }
    })();

    const schedule = () => {
      if (applying.current) return;
      useSyncStore.getState().touchLocal();
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void push(), PUSH_DEBOUNCE_MS);
    };
    const unsubscribe = useSettingsStore.subscribe((s, prev) => {
      if (
        s.theme !== prev.theme ||
        s.soundEnabled !== prev.soundEnabled ||
        s.volume !== prev.volume ||
        s.speed !== prev.speed
      ) {
        schedule();
      }
    });
    i18n.on('languageChanged', schedule);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      unsubscribe();
      i18n.off('languageChanged', schedule);
    };
  }, [status, i18n]);
}
