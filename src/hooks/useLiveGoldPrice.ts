import { useEffect, useRef } from 'react';
import { useLivePricesStore } from '../store/livePricesStore';
import { fetchLiveGoldPrice } from '../utils/goldPrice';
import { useGoldSettingsStore, applyGoldPremium } from '../store/goldSettingsStore';

// The API response is CDN-cached for 60s (see api/market/gold.js), so
// polling faster than that just hits cache — 30s keeps the "Live" ticker
// feeling current without any wasted round-trips.
const REFRESH_MS = 30_000;

/**
 * Polls the live 24K gold rate (see api/market/gold.js) app-wide, so the
 * Dashboard "Live Gold Price" ticker (24K + derived 22K) always has a
 * fresh number — not just for people who already hold a Gold asset.
 * Silver/Platinum aren't covered — only 24K gold has a free, keyless spot
 * source wired up.
 */
export function useLiveGoldPrice() {
  const setGoldPrice = useLivePricesStore((s) => s.setGoldPrice);
  const setGoldPriceLoading = useLivePricesStore((s) => s.setGoldPriceLoading);
  const setGoldPriceError = useLivePricesStore((s) => s.setGoldPriceError);
  // Calibration % (import duty + GST + dealer margin) applied on top of the
  // raw global-spot-derived rate — see goldSettingsStore.ts. Applying it once
  // here, before it ever hits the store, means every screen that reads
  // goldPricePerGram (Dashboard ticker, Wealth asset auto-fill, etc.) gets
  // the calibrated number automatically.
  const premiumPercent = useGoldSettingsStore((s) => s.premiumPercent);
  const fetching = useRef(false);

  useEffect(() => {
    const refresh = async () => {
      if (fetching.current) return;
      fetching.current = true;
      setGoldPriceLoading(true);
      const result = await fetchLiveGoldPrice();
      if (result) {
        setGoldPrice(applyGoldPremium(result.pricePerGram24k, premiumPercent), result.asOf);
      } else {
        setGoldPriceError(true);
        setGoldPriceLoading(false);
      }
      fetching.current = false;
    };

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [setGoldPrice, setGoldPriceLoading, setGoldPriceError, premiumPercent]);
}
