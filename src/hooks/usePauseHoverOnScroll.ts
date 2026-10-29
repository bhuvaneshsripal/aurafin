import { useEffect } from 'react';

/**
 * Pauses row hover while the page is being scrolled.
 *
 * With a long table (100+ holdings) and a mouse, every row that slides under
 * a stationary cursor re-runs hit-testing and hover styling, which makes
 * scrolling heavy. While the window is scrolling this sets
 * `data-scrolling` on <html>; index.css uses it to switch off pointer events
 * on anything carrying the `scroll-pause-hover` class. A short moment after
 * the last scroll event the attribute is removed and hover resumes.
 *
 * Only the document's own scroll is tracked (the table's horizontal scroll is
 * a nested container and is unaffected), and the attribute is only written
 * when it actually changes — not on every scroll event.
 */
const IDLE_MS = 120;

export function usePauseHoverOnScroll() {
  useEffect(() => {
    const root = document.documentElement;
    let timer: number | undefined;
    let paused = false;

    const resume = () => {
      paused = false;
      root.removeAttribute('data-scrolling');
    };
    const onScroll = () => {
      if (!paused) {
        paused = true;
        root.setAttribute('data-scrolling', '');
      }
      window.clearTimeout(timer);
      timer = window.setTimeout(resume, IDLE_MS);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(timer);
      resume();
    };
  }, []);
}
