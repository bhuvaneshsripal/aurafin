import { useEffect } from 'react';
import { fetchDeployedBuildId } from '../utils/updateChecks';
import { hardRefresh } from '../utils/hardRefresh';
import { useRefreshBarStore } from '../store/refreshBarStore';
import { useLivePricesStore } from '../store/livePricesStore';
import {
  AWAY_MS,
  activateWaitingUpdate,
  decideResume,
  readLastReload,
  readLastSeen,
  writeLastSeen,
} from '../utils/resumeRefresh';

/** How long the green refresh line may show while waiting for fresh prices. */
const BAR_MAX_MS = 3_500;
/** While the app is on screen, remember "last seen" this often so a killed app still knows. */
const STAMP_EVERY_MS = 20_000;
const TOUCH_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

const typingInField = () => {
  const el = document.activeElement;
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
};

/**
 * "Welcome back" refresh. When the app is opened (or brought back to the front) after being away
 * for 30 minutes or more:
 *
 *  - If a newer version has been deployed and nothing has been touched yet, it switches to the
 *    new version straight away (a quick reload, no cache wipe), because that is the one moment a
 *    reload cannot interrupt anything. If you have already started tapping, it leaves the
 *    existing "New AuraFin update" notice to handle it instead.
 *  - Either way a thin green line runs under the top bar until the fresh prices arrive (at most
 *    3.5 seconds), so it is clear the numbers are being brought up to date. Prices, gold and
 *    market tables refetch by themselves on return (see useLivePrices and friends).
 *
 * Skipped while offline. Works for a cold start (app was closed) and for a resume (app was in the
 * background): the last-seen time is saved while the app is on screen and when it goes away.
 */
export function useResumeRefresh() {
  useEffect(() => {
    let running = false;
    let hiddenAt: number | null = null;

    const run = async (awayMs: number) => {
      if (running) return;
      running = true;

      // Has the person started using the app since we came back?
      let touched = false;
      const markTouched = () => {
        touched = true;
      };
      TOUCH_EVENTS.forEach((e) => window.addEventListener(e, markTouched, { passive: true }));

      // Progress line until prices land (or a short cap).
      const startedAt = Date.now();
      const bar = useRefreshBarStore.getState();
      let barOn = false;
      let stopWatching: (() => void) | null = null;
      let capTimer: number | undefined;
      const endBar = () => {
        if (capTimer !== undefined) window.clearTimeout(capTimer);
        stopWatching?.();
        stopWatching = null;
        if (barOn) {
          barOn = false;
          useRefreshBarStore.getState().setActive(false);
        }
      };

      try {
        const online = navigator.onLine !== false;
        if (online) {
          bar.setActive(true);
          barOn = true;
          stopWatching = useLivePricesStore.subscribe((s) => {
            if (s.pricesUpdatedAt !== null && s.pricesUpdatedAt >= startedAt) endBar();
          });
          capTimer = window.setTimeout(endBar, BAR_MAX_MS);
        }

        let outdated = false;
        if (online && !import.meta.env.DEV && typeof __BUILD_ID__ !== 'undefined') {
          const deployed = await fetchDeployedBuildId();
          outdated = !!deployed && deployed !== __BUILD_ID__;
        }

        const lastReload = readLastReload();
        const action = decideResume({
          awayMs,
          outdated,
          busy: touched || typingInField(),
          online: navigator.onLine !== false,
          sinceLastReloadMs: lastReload === null ? null : Date.now() - lastReload,
        });

        if (action === 'update') {
          writeLastSeen();
          const switched = await activateWaitingUpdate();
          // No new worker to switch to (e.g. no service worker): fall back to a full refresh
          // that stays on this page.
          if (!switched && !touched && !typingInField()) void hardRefresh({ keepPage: true });
        }
      } finally {
        // Leave the line running if a reload is under way; the page is about to go away anyway.
        if (capTimer === undefined) endBar();
        TOUCH_EVENTS.forEach((e) => window.removeEventListener(e, markTouched));
        running = false;
      }
    };

    // Cold start: how long since the app was last on screen?
    const last = readLastSeen();
    const now = Date.now();
    writeLastSeen(now);
    if (last !== null && now - last >= AWAY_MS) void run(now - last);

    const onHidden = () => {
      hiddenAt = Date.now();
      writeLastSeen();
    };
    const onShown = () => {
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      writeLastSeen();
      if (away >= AWAY_MS) void run(away);
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
