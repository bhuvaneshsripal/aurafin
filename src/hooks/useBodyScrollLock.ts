import { useEffect } from 'react';

/**
 * Number of overlays currently asking for the page behind to stay still.
 * Shared across every caller so overlays can open and close in any order.
 */
let lockCount = 0;
let bodyOverflowBeforeLock = '';
let htmlOverflowBeforeLock = '';
let lockedScrollY = 0;
let pinScroll: (() => void) | null = null;

/**
 * Locks page scrolling while `active` is true. Used by every overlay (modals,
 * the quick-add menu, the bottom-nav sheet, search, etc.).
 *
 * Why <html> as well as <body>: index.css sets `overflow-x: clip` on <html>.
 * Once <html> has a non-visible overflow, the browser stops propagating
 * <body>'s overflow to the viewport, so `body { overflow: hidden }` alone
 * does NOT stop the page scrolling — the background kept moving under every
 * modal. The lock therefore has to be applied to <html> (the real scroller).
 *
 * The scroll position is also pinned as a safety net (some mobile browsers
 * still let a gesture nudge the document), so the page behind never moves.
 * Only scrolling is blocked — React keeps rendering, so live prices and
 * every other value behind the overlay continue to update in place.
 *
 * Overlays are reference-counted: the original values are captured once,
 * when the first overlay opens, and restored only when the last one closes.
 */
export function useBodyScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const html = document.documentElement;
      bodyOverflowBeforeLock = document.body.style.overflow;
      htmlOverflowBeforeLock = html.style.overflow;
      lockedScrollY = window.scrollY;
      html.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      pinScroll = () => {
        if (window.scrollY !== lockedScrollY) {
          window.scrollTo({ top: lockedScrollY, behavior: 'instant' });
        }
      };
      window.addEventListener('scroll', pinScroll, { passive: true });
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        if (pinScroll) window.removeEventListener('scroll', pinScroll);
        pinScroll = null;
        document.documentElement.style.overflow = htmlOverflowBeforeLock;
        document.body.style.overflow = bodyOverflowBeforeLock;
      }
    };
  }, [active]);
}
