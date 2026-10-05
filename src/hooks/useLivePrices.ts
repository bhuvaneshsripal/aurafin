import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { fetchLiveQuotes, type PriceLookup } from '../utils/marketPrices';
import { isMarketOpen } from '../utils/marketHours';

/** Poll every second while the market is open (and the tab is visible);
 *  prices can't change outside trading hours, so back off to once a minute. */
const LIVE_REFRESH_MS = 1_000;
const IDLE_REFRESH_MS = 60_000;

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

  const equityAssets = assets.filter((a) => a.symbol && a.quantity && a.quantity > 0);
  // Key off symbol+isin so a newly-added ISIN (e.g. after a re-import) triggers a refresh.
  const lookupKey = equityAssets
    .map((a) => `${a.symbol}|${a.isin ?? ''}`)
    .sort()
    .join(',');

  useEffect(() => {
    if (!lookupKey) return;

    const refresh = async () => {
      if (fetching.current) return;
      fetching.current = true;
      setLoading(true);
      try {
        const lookups: PriceLookup[] = equityAssets.map((a) => ({
          key: a.symbol!,
          isin: a.isin,
          name: a.name,
        }));
        const quoteMap = await fetchLiveQuotes(lookups);
        const prices: Record<string, number> = {};
        const previousCloses: Record<string, number> = {};
        quoteMap.forEach((quote, symbol) => {
          prices[symbol] = quote.price;
          if (quote.previousClose !== undefined) previousCloses[symbol] = quote.previousClose;
        });
        if (Object.keys(prices).length > 0) {
          setPrices(prices);
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
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      if (stopped) return;
      if (!document.hidden) await refresh();
      if (stopped) return;
      timer = setTimeout(loop, isMarketOpen() ? LIVE_REFRESH_MS : IDLE_REFRESH_MS);
    };
    const onVisible = () => {
      if (!document.hidden) {
        clearTimeout(timer);
        loop();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    loop();
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, setPrices, setPreviousCloses, setLoading, setPricesAttempted]);
}
