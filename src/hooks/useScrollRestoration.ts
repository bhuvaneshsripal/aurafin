import { useLayoutEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';
import { KEEP_PAGE_FLAG } from '../utils/hardRefresh';

/**
 * Route-aware scroll handling, keyed by HISTORY ENTRY (location.key), not by URL:
 *
 *  - Back / Forward (POP)  -> the page lands exactly where that entry was left.
 *    Never reset to the top, and each entry (Settings, Settings > Preferences,
 *    ...) keeps its own position independently.
 *  - New navigation (PUSH) -> the new page starts at the top. This covers the
 *    bottom-nav / sidebar tabs, links, and opening a sub page.
 *  - REPLACE on the same page (URL sync like ?tab=, a redirect inside a page)
 *    -> left alone, so nothing jumps. A REPLACE to a different page starts at top.
 *
 * It is an in-memory Map: a real refresh clears it. A refresh instead restores
 * the last position once, through sessionStorage (see `reloadRestore`).
 *
 * Restoring is done before paint (useLayoutEffect) so there is no flash at the
 * top. If the page isn't tall enough yet (lazy chunk / data still loading) the
 * restore is retried for a moment, and stops the instant the user touches or
 * scrolls, so it never fights them.
 */
const positions = new Map<string, number>();

const SESSION_KEY = 'aurafin-scroll-reload';
let reloadRestore: { key: string; top: number } | null = null;
try {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const raw = sessionStorage.getItem(SESSION_KEY);
  // Only a refresh the person asked for on a page (tapping the tab they're on) keeps its
  // scroll spot. Logging in, opening the app or a plain reload always start at the top.
  const keepPage = sessionStorage.getItem(KEEP_PAGE_FLAG) === '1';
  if (raw && nav?.type === 'reload' && keepPage) reloadRestore = JSON.parse(raw);
} catch {
  /* best-effort */
}

export function useScrollRestoration() {
  const location = useLocation();
  const navType = useNavigationType();
  const entryKey = location.key;
  const urlKey = location.pathname + location.search;
  const prev = useRef<{ pathname: string; urlKey: string } | null>(null);

  useLayoutEffect(() => {
    const before = prev.current;
    prev.current = { pathname: location.pathname, urlKey };

    // Where to land. null = leave the scroll position exactly as it is.
    let target: number | null;
    if (!before) {
      // First render of the app: a refresh restores once, anything else starts at the top.
      if (reloadRestore && reloadRestore.key === urlKey) target = reloadRestore.top;
      else target = 0;
      reloadRestore = null;
    } else if (navType === 'POP') {
      target = positions.get(entryKey) ?? 0;
    } else if (navType === 'PUSH') {
      target = urlKey !== before.urlKey ? 0 : null;
    } else {
      // REPLACE
      target = location.pathname !== before.pathname ? 0 : null;
    }

    let raf = 0;
    let restoring = false;
    let stopListening = () => {};

    if (target === null) {
      positions.set(entryKey, window.scrollY);
    } else if (target === 0) {
      window.scrollTo({ top: 0, behavior: 'instant' });
      positions.set(entryKey, 0);
    } else {
      const goal = target;
      positions.set(entryKey, goal);
      restoring = true;
      const start = performance.now();
      const finish = () => {
        restoring = false;
        cancelAnimationFrame(raf);
        stopListening();
      };
      const onUser = () => {
        positions.set(entryKey, window.scrollY);
        finish();
      };
      window.addEventListener('touchstart', onUser, { once: true, passive: true });
      window.addEventListener('wheel', onUser, { once: true, passive: true });
      window.addEventListener('keydown', onUser, { once: true });
      stopListening = () => {
        window.removeEventListener('touchstart', onUser);
        window.removeEventListener('wheel', onUser);
        window.removeEventListener('keydown', onUser);
      };
      // The page may not be tall enough on the first frame, so keep trying
      // until the spot is reachable (or ~3s pass).
      const tick = () => {
        window.scrollTo({ top: goal, behavior: 'instant' });
        if (Math.abs(window.scrollY - goal) < 2 || performance.now() - start > 3000) finish();
        else raf = requestAnimationFrame(tick);
      };
      tick();
    }

    // Record this entry's position as it is scrolled (the next route's DOM is
    // already in place by the time a cleanup could capture it). While a restore
    // is still settling, scroll events are ours and must not overwrite the goal.
    // The sessionStorage copy (refresh restore) is written only once scrolling
    // settles, since it is synchronous and would stutter mid-scroll on phones.
    let saveTimer: number | undefined;
    const save = () => {
      window.clearTimeout(saveTimer);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key: urlKey, top: window.scrollY }));
      } catch {
        /* best-effort */
      }
    };
    const onScroll = () => {
      if (restoring) return;
      positions.set(entryKey, window.scrollY);
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(save, 200);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', save);
    return () => {
      cancelAnimationFrame(raf);
      stopListening();
      // A pending save would record the NEXT page's position under this one.
      window.clearTimeout(saveTimer);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', save);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryKey]);
}
