import { useEffect } from 'react';
import { useRefreshBarStore } from '../store/refreshBarStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { AWAY_MS, readLastSeen, writeLastSeen } from '../utils/resumeRefresh';

/** How long the green refresh line may show while waiting for fresh prices. */
const BAR_MAX_MS = 3_500;
/** While the app is on screen, remember "last seen" this often so a killed app still knows. */
const STAMP_EVERY_MS = 20_000;

/**
 * "Welcome back" refresh. When the app is opened (or brought back to the front) after being away
 * for 30 minutes or more, a thin green line runs under the top bar until the fresh prices arrive
 * (at most 3.5 seconds), so it is clear the numbers are being brought up to date. Prices, gold and
 * market tables refetch by themselves on return (see useLivePrices and friends).
 *
 * This never switches the app to a newer version: that happens only when the person taps Update.
 *
 * Skipped while offline. Works for a cold start (app was closed) and for a resume (app was in the
 * background): the last-seen time is saved while the app is on screen and when it goes away.
 */
export function useResumeRefresh() {
  useEffect(() => {
    let running = false;
    let hiddenAt: number | null = null;

    const run = () => {
      if (running) return;
      if (navigator.onLine === false) return;
      running = true;

      const startedAt = Date.now();
      const bar = useRefreshBarStore.getState();
      bar.setActive(true);

      let capTimer: number | undefined;
      let stopWatching: (() => void) | null = null;
      const endBar = () => {
        if (capTimer !== undefined) window.clearTimeout(capTimer);
        stopWatching?.();
        stopWatching = null;
        useRefreshBarStore.getState().setActive(false);
        running = false;
      };
      stopWatching = useLivePricesStore.subscribe((s) => {
        if (s.pricesUpdatedAt !== null && s.pricesUpdatedAt >= startedAt) endBar();
      });
      capTimer = window.setTimeout(endBar, BAR_MAX_MS);
    };

    // Cold start: how long since the app was last on screen?
    const last = readLastSeen();
    const now = Date.now();
    writeLastSeen(now);
    if (last !== null && now - last >= AWAY_MS) run();

    const onHidden = () => {
      hiddenAt = Date.now();
      writeLastSeen();
    };
    const onShown = () => {
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      writeLastSeen();
      if (away >= AWAY_MS) run();
    };
    const onVisibility = () => (document.visibilityState === 'hidden' ? onHidden() : onShown());
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) onShown();
    };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onHidden);
    window.addEventListener('pageshow', onPageShow);
    const stamp = window.setInterval(() => {
      if (document.visibilityState === 'visible') writeLastSeen();
    }, STAMP_EVERY_MS);

    return () => {
      window.clearInterval(stamp);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onHidden);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, []);
}
