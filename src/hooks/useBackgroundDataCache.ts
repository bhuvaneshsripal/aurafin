import { useEffect } from 'react';
import { writeCache, CACHE_NAMES } from '../utils/fetchCache';
import { getNetworkQuality } from '../store/networkStore';
import { visibleInterval } from '../utils/visibleInterval';

const EVERY_MS = 60_000;
const FIRST_RUN_DELAY_MS = 8_000;

const SOURCES: { name: string; url: string }[] = [
  { name: CACHE_NAMES.indian, url: '/api/market/indian-indices' },
  { name: CACHE_NAMES.global, url: '/api/market/global-indices' },
];

/**
 * Once a minute, quietly refreshes the saved copy of the market tables so
 * that, if the connection later drops, the last-fetched numbers are recent
 * rather than from whenever that screen was last opened. Runs whether or not
 * the screens are open; skips while offline. (Browsers slow or pause timers
 * in a hidden tab, so "every minute" holds while the app is open, not after
 * it has been closed.)
 */
export function useBackgroundDataCache() {
  useEffect(() => {
    let stopped = false;
    const run = async () => {
      if (getNetworkQuality() === 'offline') return;
      await Promise.all(
        SOURCES.map(async ({ name, url }) => {
          try {
            const res = await fetch(url, { cache: 'no-store' });
            if (!res.ok) return;
            const json = await res.json();
            if (!stopped && Array.isArray(json?.indices)) writeCache(name, json.indices);
          } catch {
            /* keep the previous saved copy */
          }
        })
      );
    };
    // Not needed to draw the first screen, and on a weak connection these two requests compete
    // with the app's own scripts and the live-price fetch -- so the first run waits a few seconds.
    const firstRun = setTimeout(() => void run(), FIRST_RUN_DELAY_MS);
    const stopPoll = visibleInterval(() => void run(), EVERY_MS);
    return () => {
      stopped = true;
      clearTimeout(firstRun);
      stopPoll();
    };
  }, []);
}
