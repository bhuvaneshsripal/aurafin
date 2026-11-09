/**
 * setInterval that sleeps while the tab / app is in the background.
 *
 * Polling loops (live quotes, watchlists, caches) used to keep hitting the
 * network and re-rendering every few seconds even when nobody was looking,
 * which burns battery and data and causes jank on return. This skips ticks
 * while the page is hidden and, when it becomes visible again after a missed
 * tick, runs `fn` once straight away so the data is fresh.
 *
 * Returns a cleanup function (clears the timer and the listener).
 */
export function visibleInterval(fn: () => void, ms: number): () => void {
  let last = Date.now();
  const run = () => {
    last = Date.now();
    fn();
  };
  const id = window.setInterval(() => {
    if (document.visibilityState === 'hidden') return;
    run();
  }, ms);
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - last >= ms) run();
  };
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    window.clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
