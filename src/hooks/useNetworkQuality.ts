import { useEffect, useState } from 'react';
import { useNetworkStore } from '../store/networkStore';

export type NetworkQuality = 'good' | 'low' | 'offline';

const PROBE_EVERY_MS = 20_000;
const SLOW_AFTER_MS = 2_500;
const GIVE_UP_AFTER_MS = 8_000;

interface NavigatorConnection {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
  saveData?: boolean;
  addEventListener?: (t: string, cb: () => void) => void;
  removeEventListener?: (t: string, cb: () => void) => void;
}

function connection(): NavigatorConnection | undefined {
  return (navigator as Navigator & { connection?: NavigatorConnection }).connection;
}

/** Hint from the browser's Network Information API (Chromium) — instant, no
 *  request. Missing on Safari/Firefox, where the timed probe does the job. */
function hintSaysSlow() {
  const c = connection();
  if (!c) return false;
  return c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || (c.rtt !== undefined && c.rtt > 1500);
}

/**
 * Tracks whether the connection is 'good', 'low' (slow or flaky) or
 * 'offline'. Offline comes from the browser's online/offline events; "low"
 * comes from the connection hint plus a tiny timed request to our own origin
 * every 20s, so a bar of signal that never actually loads anything is still
 * reported honestly.
 */
export function useNetworkQuality(): NetworkQuality {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [slow, setSlow] = useState(() => hintSaysSlow());

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const c = connection();
    const onChange = () => setSlow(hintSaysSlow());
    c?.addEventListener?.('change', onChange);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      c?.removeEventListener?.('change', onChange);
    };
  }, []);

  useEffect(() => {
    if (!online) return;
    let cancelled = false;
    let timer: number | undefined;

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
        if (!cancelled) setSlow(hintSaysSlow() || performance.now() - started > SLOW_AFTER_MS);
      } catch {
        // Timed out, or the request failed while the browser still thinks
        // it's online (captive portal, dead Wi-Fi): treat as a weak link.
        if (!cancelled) setSlow(true);
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
