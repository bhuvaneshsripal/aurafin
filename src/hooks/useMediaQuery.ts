import { useCallback, useSyncExternalStore } from 'react';

/**
 * Live `window.matchMedia(query).matches`, read synchronously on the first
 * render (no flash of the wrong layout) and kept current when the viewport
 * crosses the breakpoint.
 *
 * Use it to render only the layout that is actually visible. Rendering both a
 * phone list and a desktop table and hiding one with CSS (`sm:hidden`) still
 * builds, lays out and re-renders the hidden copy on every update.
 *
 * Tailwind's `sm` breakpoint is `(min-width: 40rem)`.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (typeof window === 'undefined' || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    [query]
  );
  const getSnapshot = () => (typeof window !== 'undefined' && !!window.matchMedia ? window.matchMedia(query).matches : false);
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
