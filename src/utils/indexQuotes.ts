import { useSyncExternalStore } from 'react';
import { isMarketOpen } from './marketHours';

/**
 * One shared source of truth for the Nifty / Sensex / Bank Nifty levels.
 *
 * Before this existed, every consumer ran its own poller against
 * /api/market/indices: the desktop top-bar strip AND the mobile strip (both
 * are always mounted, one is just hidden by CSS) each polled once a second,
 * and the market-alerts hook fetched the same endpoint again every 5 seconds.
 * That is 2+ identical serverless calls per second per open tab. Now there is
 * a single poll loop that runs only while something is subscribed to it, and
 * everything else reads its latest result.
 */

export interface IndexQuote {
  key: string;
  name: string;
  price: number;
  previousClose?: number;
  /** Today's opening level, when the data source provides it. */
  open?: number;
}

/** Latest quotes: undefined = still loading, null = unavailable, array = data. */
export type IndexQuotesState = IndexQuote[] | null | undefined;

const LIVE_MS = 1_000; // market open: refresh every second
const IDLE_MS = 30_000; // market closed: nothing moves, so poll lazily
const CACHE_KEY = 'aurafin.tickerQuotes';
/** Hidden tab / app in the background: still refresh the saved copy once a minute. */
const BACKGROUND_MS = 60_000;
let lastFetchAt = 0;
/** Persisting to localStorage is synchronous; once every few seconds is plenty. */
const CACHE_WRITE_EVERY_MS = 5_000;

/** Fetches the index levels once. Returns null if the request failed. */
export async function fetchIndexQuotes(): Promise<IndexQuote[] | null> {
  try {
    // Abort a hung request so one slow response can't freeze the updates.
    const ctrl = new AbortController();
    const abort = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`/api/market/indices?_=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal }).finally(() =>
      window.clearTimeout(abort)
    );
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.indices) ? json.indices : null;
  } catch {
    return null;
  }
}

/** Last good quotes from the previous visit, so a refresh shows numbers straight away. */
function readCachedQuotes(): IndexQuote[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

let snapshot: IndexQuotesState = readCachedQuotes();
let snapshotJson = snapshot ? JSON.stringify(snapshot) : '';
let lastGood: IndexQuote[] | null = null;
let lastGoodAt = 0;
let lastCacheWrite = 0;
const listeners = new Set<() => void>();
let stopPolling: (() => void) | null = null;

function publish(next: IndexQuotesState) {
  // Same numbers as last time (market closed, no tick yet): keep the same
  // reference so subscribed components don't re-render for nothing.
  const json = Array.isArray(next) ? JSON.stringify(next) : '';
  if (next === snapshot || (Array.isArray(next) && json === snapshotJson)) return;
  snapshot = next;
  snapshotJson = json;
  listeners.forEach((l) => l());
}

function persist(q: IndexQuote[], force = false) {
  const now = Date.now();
  if (!force && now - lastCacheWrite < CACHE_WRITE_EVERY_MS) return;
  lastCacheWrite = now;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(q));
  } catch {
    /* storage unavailable — fine, just no instant paint next time */
  }
}

function startPolling(): () => void {
  let cancelled = false;
  let timer: number | undefined;
  // Generation token: restarting the loop (tab becomes visible again) bumps
  // it, so a request still in flight from the previous chain can't also
  // schedule its own next tick -- otherwise every tab switch could leave an
  // extra poller running forever.
  let generation = 0;
  // Chained timeouts (not setInterval) so a slow response never overlaps the next request.
  const tick = async () => {
    const myGeneration = ++generation;
    const startedAt = Date.now();
    const hidden = document.visibilityState === 'hidden';
    if (!hidden || startedAt - lastFetchAt >= BACKGROUND_MS) {
      lastFetchAt = startedAt;
      const q = await fetchIndexQuotes();
      if (q) {
        lastGood = q;
        lastGoodAt = Date.now();
        persist(q);
      }
      // Keep showing the last good values if a refresh fails.
      if (!cancelled && myGeneration === generation) publish(q ?? (Array.isArray(snapshot) ? snapshot : null));
    }
    // Count the interval from when the request started (not finished), so
    // a 400ms response still gives a true one-second cadence.
    const interval = isMarketOpen() ? LIVE_MS : IDLE_MS;
    if (!cancelled && myGeneration === generation) {
      timer = window.setTimeout(tick, Math.max(0, interval - (Date.now() - startedAt)));
    }
  };
  void tick();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') {
      window.clearTimeout(timer);
      void tick();
    } else if (lastGood) {
      persist(lastGood, true); // going to the background: save the freshest copy
    }
  };
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) stopPolling = startPolling();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      stopPolling?.();
      stopPolling = null;
    }
  };
}

/** Live index levels, shared by every component that calls it (one poller total). */
export function useIndexQuotes(): IndexQuotesState {
  return useSyncExternalStore(subscribe, () => snapshot);
}

/** The newest successfully fetched quotes if they are younger than `maxAgeMs`, else null. */
export function getRecentIndexQuotes(maxAgeMs: number): IndexQuote[] | null {
  return lastGood && Date.now() - lastGoodAt <= maxAgeMs ? lastGood : null;
}
