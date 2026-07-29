import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { fetchLiveGoldPrice } from '../utils/goldPrice';

const REFRESH_MS = 60_000;

/**
 * Polls the live 24K gold rate (see api/market/gold.js) whenever the
 * person holds at least one Gold asset. Silver/Platinum aren't covered —
 * only 24K gold has a free, keyless spot source wired up.
 */
export function useLiveGoldPrice() {
  const hasGold = useAssetsStore((s) => s.assets.some((a) => a.assetClass === 'gold'));
  const setGoldPrice = useLivePricesStore((s) => s.setGoldPrice);
  const setGoldPriceLoading = useLivePricesStore((s) => s.setGoldPriceLoading);
  const setGoldPriceError = useLivePricesStore((s) => s.setGoldPriceError);
  const setGoldInitialized = useLivePricesStore((s) => s.setGoldInitialized);
  const fetching = useRef(false);

  useEffect(() => {
    if (!hasGold) return;

    const refresh = async () => {
      if (fetching.current) return;
      fetching.current = true;
      setGoldPriceLoading(true);
      const result = await fetchLiveGoldPrice();
      if (result) {
        setGoldPrice(result.pricePerGram24k, result.asOf);
      } else {
        setGoldPriceError(true);
        setGoldPriceLoading(false);
      }
      fetching.current = false;
      setGoldInitialized();
    };

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [hasGold, setGoldPrice, setGoldPriceLoading, setGoldPriceError, setGoldInitialized]);
}
