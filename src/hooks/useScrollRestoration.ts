import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Remembers how far down each page you'd scrolled, so switching to another
 * page (sidebar, bottom nav, a link) and coming back lands you exactly
 * where you left off instead of snapping back to the top.
 *
 * Deliberately an in-memory Map, not sessionStorage/localStorage — a real
 * page refresh clears it, so reloading the page always starts fresh at the
 * top, while navigating around inside the running app preserves position.
 * Keyed by pathname + search so e.g. Wealth's own tabs (?tab=assets vs
 * ?tab=liabilities) each keep their own separate scroll position.
 */
const scrollMemory = new Map<string, number>();

// A browser refresh does wipe the Map above, so the last position is also
// mirrored into sessionStorage (per tab) and used once — only when the page
// was actually reloaded — so a refresh keeps you where you were.
const SESSION_KEY = 'aurafin-scroll-reload';
let reloadRestore: { key: string; top: number } | null = null;
try {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (raw && nav?.type === 'reload') reloadRestore = JSON.parse(raw);
} catch {
  /* best-effort */
}

export function useScrollRestoration() {
  const location = useLocation();
  const key = location.pathname + location.search;

  // Runs before paint on every route change, so there's no flash of the
  // new page at the top before jumping to the remembered spot.
  useLayoutEffect(() => {
    let saved = scrollMemory.get(key);
    let raf = 0;
    if (saved === undefined && reloadRestore && reloadRestore.key === key) {
      // The page content (lazy chunk, data) usually isn't tall enough yet on
      // first paint, so keep retrying briefly until the target is reachable.
      const target = reloadRestore.top;
      reloadRestore = null;
      saved = target;
      const start = performance.now();
      const stop = () => cancelAnimationFrame(raf);
      window.addEventListener('touchstart', stop, { once: true, passive: true });
      window.addEventListener('wheel', stop, { once: true, passive: true });
      const tick = () => {
        window.scrollTo({ top: target, behavior: 'instant' });
        const reached = Math.abs(window.scrollY - target) < 2;
        if (!reached && performance.now() - start < 3000) raf = requestAnimationFrame(tick);
      };
      tick();
    }
    window.scrollTo({ top: saved ?? 0, behavior: 'instant' });

    // Keep recording this page's position as the user scrolls it, rather
    // than trying to capture it once on the way out — by the time an
    // effect for the *next* route would run, this route's DOM (and its
    // scroll position) is already gone.
    const onScroll = () => {
      scrollMemory.set(key, window.scrollY);
      try {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify({ key, top: window.scrollY }));
      } catch {
        /* best-effort */
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [key]);
}
