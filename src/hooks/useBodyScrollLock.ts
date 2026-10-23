import { useEffect } from 'react';

/**
 * Number of overlays currently asking for the page behind to stay still.
 * Shared across every caller so overlays can open and close in any order.
 */
let lockCount = 0;
let htmlOverflowBeforeLock = '';
let lockedScrollY = 0;
let pinScroll: (() => void) | null = null;
let onFocusOut: (() => void) | null = null;

/**
 * Locks page scrolling while `active` is true. Used by every overlay (modals,
 * the quick-add menu, the bottom-nav sheet, search, etc.).
 *
 * Why <html> and not <body>: index.css sets `overflow-x: clip` on <html>.
 * Once <html> has a non-visible overflow, the browser stops propagating
 * <body>'s overflow to the viewport, so `body { overflow: hidden }` does
 * NOT stop the page scrolling — and it also breaks sticky positioning of the
 * sidebar/top bar. The lock is therefore applied to <html> only.
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
      htmlOverflowBeforeLock = html.style.overflow;
      lockedScrollY = window.scrollY;
      html.style.overflow = 'hidden';
      // Deliberately NOT setting overflow on <body>: once <html> has a
      // non-visible overflow, <body>'s overflow no longer propagates to the
      // viewport, so `body { overflow: hidden }` would turn <body> into its
      // own (non-scrolling) scroll container. Every `position: sticky`
      // element inside it (sidebar, top bar) then stops sticking and scrolls
      // away with the page — the Edit Asset panel opened over a page with
      // the sidebar/top bar shifted up. Locking <html> alone is enough.
      pinScroll = () => {
        // While a field is focused the browser scrolls to reveal it as the
        // keyboard opens; snapping back every frame fights that and makes the
        // screen flicker. The overlay is fixed, so let it be and restore the
        // position once typing ends (see onFocusOut below).
        const a = document.activeElement;
        if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || (a as HTMLElement).isContentEditable)) return;
        if (window.scrollY !== lockedScrollY) {
          window.scrollTo({ top: lockedScrollY, behavior: 'instant' });
        }
      };
      window.addEventListener('scroll', pinScroll, { passive: true });
      onFocusOut = () => window.setTimeout(() => pinScroll?.(), 150);
      document.addEventListener('focusout', onFocusOut);
    }
    lockCount += 1;

    return () => {
      lockCount = Math.max(0, lockCount - 1);
      if (lockCount === 0) {
        if (pinScroll) window.removeEventListener('scroll', pinScroll);
        pinScroll = null;
        if (onFocusOut) document.removeEventListener('focusout', onFocusOut);
        onFocusOut = null;
        document.documentElement.style.overflow = htmlOverflowBeforeLock;
      }
    };
  }, [active]);
}
