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

export function useScrollRestoration() {
  const location = useLocation();
  const key = location.pathname + location.search;

  // Runs before paint on every route change, so there's no flash of the
  // new page at the top before jumping to the remembered spot.
  useLayoutEffect(() => {
    const saved = scrollMemory.get(key);
    window.scrollTo({ top: saved ?? 0, behavior: 'instant' });

    // Keep recording this page's position as the user scrolls it, rather
    // than trying to capture it once on the way out — by the time an
    // effect for the *next* route would run, this route's DOM (and its
    // scroll position) is already gone.
    const onScroll = () => {
      scrollMemory.set(key, window.scrollY);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [key]);
}
