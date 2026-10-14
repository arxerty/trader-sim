import { useEffect, useRef } from 'react';

export type HotkeyMap = Record<string, (event: KeyboardEvent) => void>;

const TEXT_INPUT_TYPES = new Set(['text', 'number', 'search', 'email', 'password', 'tel', 'url']);

/** True when typing in a field, so hotkeys don't hijack text input. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}

/**
 * Global keyboard shortcuts keyed by `KeyboardEvent.code` (layout-independent:
 * "KeyB" works on Russian/Ukrainian keyboards too). Ignored while typing,
 * with modifiers pressed, or while a modal dialog is open.
 */
export function useHotkeys(map: HotkeyMap, enabled = true): void {
  const mapRef = useRef(map);
  mapRef.current = map;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      const handler = mapRef.current[event.code];
      if (!handler) return;
      // Let Space activate a focused button instead of toggling pause.
      if (event.code === 'Space' && event.target instanceof HTMLButtonElement) return;
      event.preventDefault();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
