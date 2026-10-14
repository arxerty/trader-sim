import type { PersistStorage, StorageValue } from 'zustand/middleware';

/**
 * PersistStorage for zustand that
 *  - survives a missing/blocked localStorage (private mode, quota errors);
 *  - drops corrupted JSON instead of crashing and remembers which keys were reset;
 *  - throttles writes: the market changes every tick, but disk writes happen at most every `throttleMs`.
 */
const corruptedKeys = new Set<string>();
const pendingWrites = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function getStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function write(name: string, serialized: string): void {
  try {
    getStorage()?.setItem(name, serialized);
  } catch (error) {
    console.warn(`Failed to save "${name}"`, error);
  }
}

export function flushPendingWrites(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [name, serialized] of pendingWrites) write(name, serialized);
  pendingWrites.clear();
}

function isStorageValue(value: unknown): value is StorageValue<unknown> {
  return typeof value === 'object' && value !== null && 'state' in value;
}

export interface SafeStorageOptions {
  throttleMs?: number;
}

export function createSafeStorage<S>({
  throttleMs = 0,
}: SafeStorageOptions = {}): PersistStorage<S> {
  return {
    getItem(name) {
      const storage = getStorage();
      if (!storage) return null;
      let raw: string | null;
      try {
        raw = storage.getItem(name);
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isStorageValue(parsed)) throw new Error('Unexpected save format');
        // Shape is validated later by each store's migrate/merge.
        return parsed as StorageValue<S>;
      } catch {
        corruptedKeys.add(name);
        try {
          storage.removeItem(name);
        } catch {
          /* ignore */
        }
        return null;
      }
    },
    setItem(name, value) {
      let serialized: string;
      try {
        serialized = JSON.stringify(value);
      } catch (error) {
        console.warn(`Failed to serialise "${name}"`, error);
        return;
      }
      if (throttleMs <= 0) {
        write(name, serialized);
        return;
      }
      pendingWrites.set(name, serialized);
      if (!flushTimer) flushTimer = setTimeout(flushPendingWrites, throttleMs);
    },
    removeItem(name) {
      pendingWrites.delete(name);
      try {
        getStorage()?.removeItem(name);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Returns and clears the list of keys whose saves were corrupted on load. */
export function consumeCorruptedSaves(): string[] {
  const keys = [...corruptedKeys];
  corruptedKeys.clear();
  return keys;
}

export function markCorrupted(key: string): void {
  corruptedKeys.add(key);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushPendingWrites);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingWrites();
  });
}
