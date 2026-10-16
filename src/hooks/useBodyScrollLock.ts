import { useEffect } from 'react';

/**
 * Number of overlays currently asking for the page behind to stay still.
 * Shared across every caller so overlays can open and close in any order.
 */
let lockCount = 0;
let overflowBeforeLock = '';

/**
 * Locks page scrolling while `active` is true. Used by every overlay (modals,
 * the quick-add menu, the bottom-nav sheet, search, etc.).
 *
 * Overlays are reference-counted: the original `overflow` value is captured
 * once, when the first overlay opens, and restored only when the last one
 * closes. Restoring per-overlay broke when two overlays were open and closed
 * out of order (e.g. a modal opened on top of the More sheet), because the
 * first one to close would restore a stale value and the page could stay
 * locked with no way to scroll.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) overflowBeforeLock = document.body.style.overflow;
    lockCount += 1;
    document.body.style.overflow = 'hidden';

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) document.body.style.overflow = overflowBeforeLock;
    };
  }, [active]);
}
