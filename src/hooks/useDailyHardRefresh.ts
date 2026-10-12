import { useEffect } from 'react';
import { hardRefresh } from '../utils/hardRefresh';

const LAST_REFRESH_KEY = 'aurafin-last-auto-hard-refresh';
const REFRESH_HOUR = 6; // 6:00 a.m. device-local time
const CHECK_INTERVAL_MS = 30_000;

/** The most recent 6:00 a.m. (local) that is <= now. */
function latestRefreshSlot(now: Date): number {
  const slot = new Date(now);
  slot.setHours(REFRESH_HOUR, 0, 0, 0);
  if (slot.getTime() > now.getTime()) slot.setDate(slot.getDate() - 1);
  return slot.getTime();
}

function readLast(): number | null {
  try {
    const raw = localStorage.getItem(LAST_REFRESH_KEY);
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeLast(ts: number) {
  try {
    localStorage.setItem(LAST_REFRESH_KEY, String(ts));
  } catch {
    /* best-effort */
  }
}

/**
 * Runs a hard refresh once every day at 6:00 a.m. (device local time).
 * If the app was closed/asleep at 6 a.m., it refreshes the next time it is
 * opened or brought to the foreground. Skipped while offline (a hard refresh
 * clears the service worker + caches and would leave a blank page), and
 * retried automatically once the connection is back.
 */
export function useDailyHardRefresh() {
  useEffect(() => {
    const check = () => {
      const now = new Date();
      const slot = latestRefreshSlot(now);
      const last = readLast();

      // First ever run: just record "now" so we don't refresh immediately.
      if (last === null) {
        writeLast(now.getTime());
        return;
      }
      if (last >= slot) return; // already refreshed since the last 6 a.m.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

      const previous = last;
      writeLast(now.getTime()); // set before reloading to avoid a loop
      void hardRefresh().then((done) => {
        // Network was too weak to refresh safely: keep the old cached app
        // and try again later instead of marking today's refresh as done.
        if (!done && previous !== null) writeLast(previous);
      });
    };

    check();
    const id = window.setInterval(check, CHECK_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', check);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', check);
    };
  }, []);
}
