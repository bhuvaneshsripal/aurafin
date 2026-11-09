import { useCallback, useEffect, useRef, useState } from 'react';
import type { WatchItem } from '../components/ValuationWatchlist';
import { autoWatchNumbers, fetchFundamentals } from '../utils/valuation';

/** A saved stock whose numbers are older than this gets re-valued. */
export const WATCH_STALE_MS = 12 * 60 * 60 * 1000;
/** While the page is open, look for stale stocks this often. */
const CHECK_EVERY_MS = 15 * 60 * 1000;
/** After a failed lookup, leave that stock alone for a while instead of hammering the API. */
const RETRY_AFTER_MS = 10 * 60 * 1000;
/** Stocks looked up at the same time. */
const PARALLEL = 3;

const keyOf = (w: Pick<WatchItem, 'symbol' | 'exchange'>) => `${w.exchange}:${w.symbol}`;

export type WatchUpdate = Partial<Pick<WatchItem, 'price' | 'x2' | 'x3' | 'savedAt'>>;

/**
 * Keeps the Valuation watchlist fresh. A saved stock is a snapshot (price, X/2, X/3); left alone it
 * shows the day it was saved forever. This re-fetches any stock older than 12 hours:
 *  - stocks valued with the auto-filled assumptions get price, X/2 and X/3 recomputed, so new quarterly
 *    results flow in;
 *  - stocks the person adjusted by hand (`manual`) keep their X/2 and X/3 and only get a new price.
 * It runs when the page opens, when the app comes back to the foreground or online, and every 15
 * minutes while open. A failed lookup leaves that stock exactly as it was.
 *
 * `getItems` must return the latest list; `apply` merges updates (keyed "EXCHANGE:SYMBOL") into it.
 */
export function useWatchlistRefresh(
  getItems: () => WatchItem[],
  apply: (updates: Map<string, WatchUpdate>) => void,
  /** Changes whenever the set of saved stocks changes, so a list that arrives late is checked too. */
  signature: string,
) {
  const [refreshing, setRefreshing] = useState(false);
  const running = useRef(false);
  const lastTry = useRef(new Map<string, number>());
  const getRef = useRef(getItems);
  const applyRef = useRef(apply);
  getRef.current = getItems;
  applyRef.current = apply;

  const run = useCallback(async (force: boolean) => {
    if (running.current) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const now = Date.now();
    const due = getRef.current().filter((w) => {
      if (force) return true;
      if (now - w.savedAt < WATCH_STALE_MS) return false;
      return now - (lastTry.current.get(keyOf(w)) ?? 0) >= RETRY_AFTER_MS;
    });
    if (due.length === 0) return;

    running.current = true;
    setRefreshing(true);
    const updates = new Map<string, WatchUpdate>();
    let next = 0;
    const worker = async () => {
      while (next < due.length) {
        const w = due[next++];
        const k = keyOf(w);
        lastTry.current.set(k, Date.now());
        try {
          const d = await fetchFundamentals(w.symbol, w.exchange);
          // Hand-adjusted stocks keep the person's X/2 and X/3; only the price moves.
          const fresh = w.manual ? null : autoWatchNumbers(d);
          const price = fresh?.price ?? d.price;
          if (!(price !== null && price > 0)) continue;
          updates.set(k, fresh ? { ...fresh, savedAt: Date.now() } : { price, savedAt: Date.now() });
        } catch {
          /* offline or the source is down: keep the old numbers, try again later */
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, due.length) }, worker));
      if (updates.size > 0) applyRef.current(updates);
    } finally {
      running.current = false;
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void run(false);
  }, [signature, run]);

  useEffect(() => {
    const id = window.setInterval(() => void run(false), CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void run(false); };
    const onOnline = () => void run(false);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [run]);

  const refreshNow = useCallback(() => run(true), [run]);
  return { refreshing, refreshNow };
}
