import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { fetchLiveQuotes, type PriceLookup } from '../utils/marketPrices';

const REFRESH_MS = 10_000;

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

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, setPrices, setPreviousCloses, setLoading, setPricesAttempted]);
}
