import { useCallback, useRef } from 'react';

/**
 * Wraps a callback so repeated invocations within `cooldownMs` are ignored –
 * protects against double clicks on "Buy" / "Close" buttons.
 */
export function useGuardedCallback<A extends unknown[], R>(
  callback: (...args: A) => R,
  cooldownMs = 300,
): (...args: A) => R | undefined {
  const lastCall = useRef(0);
  const cbRef = useRef(callback);
  cbRef.current = callback;
  return useCallback(
    (...args: A) => {
      const now = Date.now();
      if (now - lastCall.current < cooldownMs) return undefined;
      lastCall.current = now;
      return cbRef.current(...args);
    },
    [cooldownMs],
  );
}
