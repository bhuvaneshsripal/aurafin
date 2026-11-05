import { useEffect, useState } from 'react';
import { useNetworkStore } from '../store/networkStore';

export type NetworkQuality = 'good' | 'low' | 'offline';

const PROBE_EVERY_MS = 20_000;
const SLOW_AFTER_MS = 4_000;
const GIVE_UP_AFTER_MS = 10_000;
// A single slow or failed probe is often just a busy moment (page still loading
// data, tab waking up), so "low" needs this many bad probes in a row.
const BAD_PROBES_NEEDED = 2;
const RECHECK_AFTER_BAD_MS = 3_000;

/**
 * Tracks whether the connection is 'good', 'low' (slow or flaky) or
 * 'offline'. Offline comes from the browser's online/offline events; "low"
 * comes from a tiny timed request to our own origin
 * every 20s, so a bar of signal that never actually loads anything is still
 * reported honestly.
 */
export function useNetworkQuality(): NetworkQuality {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let timer: number | undefined;
    let recheck: number | undefined;
    let bad = 0;

    const report = (isBad: boolean) => {
      if (cancelled) return;
      if (!isBad) {
        bad = 0;
        setSlow(false);
        return;
      }
      bad += 1;
      if (bad >= BAD_PROBES_NEEDED) setSlow(true);
      else {
        // Confirm quickly instead of waiting for the next 20s round.
        window.clearTimeout(recheck);
        recheck = window.setTimeout(() => void probe(), RECHECK_AFTER_BAD_MS);
      }
    };

    const probe = async () => {
      if (document.visibilityState === 'hidden') return;
      const ctrl = new AbortController();
      const abort = window.setTimeout(() => ctrl.abort(), GIVE_UP_AFTER_MS);
      const started = performance.now();
      try {
        // Unique query so neither the service worker's precache nor the HTTP
        // cache can answer it — this measures the real network.
        const res = await fetch(`/favicon.svg?probe=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal });
        await res.arrayBuffer();
        if (res.ok && performance.now() - started <= SLOW_AFTER_MS) report(false);
        else report(true);
      } catch {
        // Timed out, or the request failed while the browser still thinks
        // it's online (captive portal, dead Wi-Fi): a weak link.
        report(true);
      } finally {
        window.clearTimeout(abort);
      }
    };

    void probe();
    timer = window.setInterval(() => void probe(), PROBE_EVERY_MS);
    const onVisible = () => document.visibilityState === 'visible' && void probe();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.clearTimeout(recheck);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [online]);

  const quality: NetworkQuality = !online ? 'offline' : slow ? 'low' : 'good';

  // Publish for non-React code (see store/networkStore.ts).
  useEffect(() => {
    useNetworkStore.getState().setQuality(quality);
  }, [quality]);

  return quality;
}
