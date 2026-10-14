import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createSafeStorage } from './persistence/safeStorage';

/** Book-keeping for cloud sync (per device). */
interface SyncData {
  /** Server settings version this device last saw. */
  settingsVersion: number;
  /** When settings were last changed on this device (ms), used to resolve conflicts. */
  localChangedAt: number;
  /** User ids whose guest progress was already offered/imported on this device. */
  guestImportHandled: string[];
}

interface SyncState extends SyncData {
  setSettingsVersion: (v: number) => void;
  touchLocal: () => void;
  markGuestImportHandled: (userId: string) => void;
}

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      settingsVersion: 0,
      localChangedAt: 0,
      guestImportHandled: [],
      setSettingsVersion: (settingsVersion) => set({ settingsVersion }),
      touchLocal: () => set({ localChangedAt: Date.now() }),
      markGuestImportHandled: (userId) =>
        set((s) => ({ guestImportHandled: [...new Set([...s.guestImportHandled, userId])] })),
    }),
    {
      name: 'trader-sim:sync',
      version: 1,
      storage: createSafeStorage<SyncData>(),
      partialize: ({ settingsVersion, localChangedAt, guestImportHandled }) => ({
        settingsVersion,
        localChangedAt,
        guestImportHandled,
      }),
    },
  ),
);
