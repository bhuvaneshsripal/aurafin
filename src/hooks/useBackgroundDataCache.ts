import { useEffect } from 'react';
import { writeCache, CACHE_NAMES } from '../utils/fetchCache';
import { getNetworkQuality } from '../store/networkStore';

const EVERY_MS = 60_000;

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
    void run();
    const id = window.setInterval(() => void run(), EVERY_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);
}
