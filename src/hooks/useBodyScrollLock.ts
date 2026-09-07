import { useEffect } from 'react';

/**
 * Locks the page behind from scrolling while `active` is true — used by
 * every full-screen/backdrop overlay (modals, the quick-add menu, the
 * bottom-nav "More" sheet, global search, install prompt, etc.) so that
 * touch/wheel scrolling over the dimmed backdrop doesn't scroll the page
 * underneath it. Restores whatever inline `overflow` value was already on
 * `<body>` on close/unmount rather than assuming it was empty, so nested or
 * sequential overlays compose correctly instead of one clobbering another's
 * cleanup.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [active]);
}
