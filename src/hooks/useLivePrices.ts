import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { PRICE_BUCKET_MS, fetchLiveQuotes, forgetResolvedSymbol, looksLikeTicker, type PriceLookup } from '../utils/marketPrices';
import { isMarketOpen } from '../utils/marketHours';

/** Poll every second (on a clock shared by all devices) while the market is open (and the tab is visible);
 *  prices can't change outside trading hours, so back off to once a minute. */
const LIVE_REFRESH_MS = PRICE_BUCKET_MS;
const IDLE_REFRESH_MS = 60_000;
/** Next tick on the shared wall-clock grid (+ small jitter), so all devices fetch the same bucket. */
const alignedDelay = (ms: number) => {
  // Jitter scales with the interval: a flat 100-500 ms would stretch a 1 s poll to 1.1-1.5 s.
  const jitter = Math.min(400, ms * 0.1);
  return ms - (Date.now() % ms) + Math.floor(Math.random() * jitter) + Math.min(100, ms * 0.05);
};
/** Hidden tab / app in the background: refresh the saved prices once a minute. */
const BACKGROUND_REFRESH_MS = 60_000;
/** A price this far (as a fraction) from the last one we showed is treated as
 *  suspect: Indian stocks are capped at about ±20% a day, so more than that
 *  within minutes means a bad quote or a wrong symbol match. */
const MAX_JUMP = 0.35;
/** Only compare to the last price if it is this fresh (older ones can be a real overnight gap). */
const BASELINE_MAX_AGE_MS = 30 * 60 * 1000;

/**
 * Polls Yahoo Finance for equity holdings with a symbol + quantity.
 * Prices are kept in livePricesStore so Firestore sync doesn't overwrite them.
 */
export function useLivePrices() {
  const assets = useAssetsStore((s) => s.assets);
  const setPrices = useLivePricesStore((s) => s.setPrices);
  const setPreviousCloses = useLivePricesStore((s) => s.setPreviousCloses);
  const setLoading = useLivePricesStore((s) => s.setLoading);
  const setPricesAttempted = useLivePricesStore((s) => s.setPricesAttempted);
  const fetching = useRef(false);
  const fetchStartedAt = useRef(0);

  const equityAssets = assets.filter((a) => a.symbol && a.quantity && a.quantity > 0);
  // Key off symbol+isin so a newly-added ISIN (e.g. after a re-import) triggers a refresh.
  const lookupKey = equityAssets
    .map((a) => `${a.symbol}|${a.isin ?? ''}`)
    .sort()
    .join(',');

  useEffect(() => {
    if (!lookupKey) return;

    // Set when this effect run is torn down (symbols changed / unmounted):
    // an in-flight response from the old symbol set must not be applied.
    let stopped = false;
    let generation = 0;
    // A suspect price must come back the same on the next poll before we show it.
    const suspect = new Map<string, number>();

    const refresh = async () => {
      // Watchdog: even if something ever stalls, never stay "busy" past 30s.
      if (fetching.current && Date.now() - fetchStartedAt.current < 30_000) return;
      fetching.current = true;
      fetchStartedAt.current = Date.now();
      // Only the very first fetch shows a "loading" state. Flipping it on and off around
      // every 1 s refresh just made two extra store updates (and storage writes) per second.
      if (useLivePricesStore.getState().pricesUpdatedAt === null) setLoading(true);
      try {
        const lookups: PriceLookup[] = equityAssets.map((a) => ({
          key: a.symbol!,
          isin: a.isin,
          name: a.name,
        }));
        const quoteMap = await fetchLiveQuotes(lookups);
        if (stopped) return;
        const prices: Record<string, number> = {};
        const previousCloses: Record<string, number> = {};
        const store = useLivePricesStore.getState();
        const baselineFresh =
          store.pricesUpdatedAt !== null && Date.now() - store.pricesUpdatedAt <= BASELINE_MAX_AGE_MS;
        quoteMap.forEach((quote, symbol) => {
          // --- Sanity check: never show an absurd price, even for a moment. ---
          const asset = equityAssets.find((a) => a.symbol!.trim().toUpperCase() === symbol);
          const last = baselineFresh ? store.prices[symbol] : undefined;
          const cost =
            asset?.avgCost && asset.avgCost > 0
              ? asset.avgCost
              : asset?.investedValue && asset.quantity
                ? asset.investedValue / asset.quantity
                : undefined;
          const byName = !looksLikeTicker(symbol);
          const farFromLast = last !== undefined && Math.abs(quote.price / last - 1) > MAX_JUMP;
          const farFromPrevClose =
            quote.previousClose !== undefined && Math.abs(quote.price / quote.previousClose - 1) > 0.5;
          // A share found by name with no recent price to compare to: check it against what was paid.
          const farFromCost = byName && last === undefined && cost !== undefined && (quote.price / cost > 4 || quote.price / cost < 0.25);
          if (farFromLast || farFromPrevClose || farFromCost) {
            const seen = suspect.get(symbol);
            if (seen === undefined || Math.abs(quote.price / seen - 1) > 0.01) {
              suspect.set(symbol, quote.price); // wait for a second matching reading
              if (byName) {
                forgetResolvedSymbol(asset?.isin);
                forgetResolvedSymbol(asset?.name);
              }
              return;
            }
          }
          suspect.delete(symbol);
          prices[symbol] = quote.price;
          if (quote.previousClose !== undefined) previousCloses[symbol] = quote.previousClose;
        });
        if (Object.keys(prices).length > 0) {
          // Skip the store write (and the app-wide re-render it triggers)
          // when nothing actually moved since the last poll.
          // (setPrices merges, so only the symbols that actually came back are compared.)
          const prev = useLivePricesStore.getState().prices;
          const changed = Object.entries(prices).some(([k, v]) => prev[k] !== v);
          if (changed) setPrices(prices);
          else {
            // Nothing moved, but the cache is still confirmed current.
            useLivePricesStore.setState({ pricesUpdatedAt: Date.now() });
            setLoading(false);
          }
          if (Object.keys(previousCloses).length > 0) setPreviousCloses(previousCloses);
        } else {
          setLoading(false);
        }
      } catch {
        setLoading(false);
      } finally {
        fetching.current = false;
        setPricesAttempted(true);
      }
    };

    // Chained setTimeout (not setInterval): the next poll is scheduled only
    // after the previous one finishes, so slow responses never pile up.
    let timer: ReturnType<typeof setTimeout>;
    let lastRun = 0;
    const loop = async () => {
      if (stopped) return;
      // Only the newest loop run may schedule the next one, so becoming
      // visible mid-request can't leave two poll chains running.
      const myGeneration = ++generation;
      // In the background, only refresh if a minute has passed since the last fetch.
      if (!document.hidden || Date.now() - lastRun >= BACKGROUND_REFRESH_MS) {
        lastRun = Date.now();
        await refresh();
      }
      if (stopped || myGeneration !== generation) return;
      timer = setTimeout(
        loop,
        alignedDelay(document.hidden ? BACKGROUND_REFRESH_MS : isMarketOpen() ? LIVE_REFRESH_MS : IDLE_REFRESH_MS)
      );
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        loop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    // Back online (Wi-Fi reconnect, wake from sleep): fetch right away.
    const onOnline = () => {
      clearTimeout(timer);
      loop();
    };
    window.addEventListener('online', onOnline);
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, setPrices, setPreviousCloses, setLoading, setPricesAttempted]);
}
