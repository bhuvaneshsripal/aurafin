import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { fetchLivePrices } from '../utils/marketPrices';

const REFRESH_MS = 60_000;

/**
 * Polls Yahoo Finance for equity holdings with a symbol + quantity.
 * Prices are kept in livePricesStore so Firestore sync doesn't overwrite them.
 */
export function useLivePrices() {
  const assets = useAssetsStore((s) => s.assets);
  const setPrices = useLivePricesStore((s) => s.setPrices);
  const setLoading = useLivePricesStore((s) => s.setLoading);
  const fetching = useRef(false);

  const symbolKey = assets
    .filter((a) => a.symbol && a.quantity && a.quantity > 0)
    .map((a) => a.symbol!)
    .sort()
    .join('|');

  useEffect(() => {
    if (!symbolKey) return;

    const refresh = async () => {
      if (fetching.current) return;
      fetching.current = true;
      setLoading(true);
      try {
        const symbols = symbolKey.split('|');
        const priceMap = await fetchLivePrices(symbols);
        const prices: Record<string, number> = {};
        priceMap.forEach((price, symbol) => {
          prices[symbol] = price;
        });
        if (Object.keys(prices).length > 0) setPrices(prices);
        else setLoading(false);
      } catch {
        setLoading(false);
      } finally {
        fetching.current = false;
      }
    };

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [symbolKey, setPrices, setLoading]);
}
