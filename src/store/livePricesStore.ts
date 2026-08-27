import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/** Live-computed value for a SIP holding — the auto-calculated Current Value
 *  (units bought at each installment's NAV, priced at the latest NAV) plus
 *  the latest NAV itself so the UI can show a per-unit price too. */
export interface SipLiveEntry {
  value: number;
  units: number;
  latestNav: number;
}

interface LivePricesState {
  prices: Record<string, number>;
  /** Yesterday's close per symbol (same uppercased keys as `prices`) — lets
   *  the Holdings widget compute each holding's 1D change (₹ and %)
   *  without a second round trip. Populated alongside `prices` whenever a
   *  quote includes it; a symbol simply won't have an entry if its source
   *  didn't provide one, and 1D-change UI treats that as "unavailable"
   *  rather than assuming zero change. */
  previousCloses: Record<string, number>;
  /** Keyed by mfapi.in scheme code (i.e. the asset's `symbol` for SIPs). */
  sipValues: Record<string, SipLiveEntry>;
  lastUpdated: number | null;
  loading: boolean;
  /** True once the first equity-price fetch cycle has finished (success or
   *  failure) since the app loaded. Lets the UI hold off showing Net Worth /
   *  Total Assets until the real live price is in, instead of flashing the
   *  last-saved (possibly stale) value first and correcting a few seconds
   *  later. */
  pricesAttempted: boolean;
  /** Same idea as `pricesAttempted`, for linked-SIP NAV values. */
  sipValuesAttempted: boolean;
  setPrices: (prices: Record<string, number>) => void;
  setPreviousCloses: (previousCloses: Record<string, number>) => void;
  setSipValues: (sipValues: Record<string, SipLiveEntry>) => void;
  setLoading: (loading: boolean) => void;
  setPricesAttempted: (attempted: boolean) => void;
  setSipValuesAttempted: (attempted: boolean) => void;
  /** Live 24K gold rate (₹/gram) polled by useLiveGoldPrice whenever the
   *  person holds a Gold asset — see src/utils/goldPrice.ts. */
  goldPricePerGram: number | null;
  goldPriceAsOf: number | null;
  goldPriceLoading: boolean;
  goldPriceError: boolean;
  setGoldPrice: (pricePerGram: number, asOf: number) => void;
  setGoldPriceLoading: (loading: boolean) => void;
  setGoldPriceError: (error: boolean) => void;
}

export const useLivePricesStore = create<LivePricesState>()(
  persist(
    (set) => ({
      prices: {},
      previousCloses: {},
      sipValues: {},
      lastUpdated: null,
      loading: false,
      pricesAttempted: false,
      sipValuesAttempted: false,
      setPrices: (prices) => set({ prices, lastUpdated: Date.now(), loading: false }),
      setPreviousCloses: (previousCloses) =>
        set((s) => ({ previousCloses: { ...s.previousCloses, ...previousCloses } })),
      setSipValues: (sipValues) =>
        set((s) => ({ sipValues: { ...s.sipValues, ...sipValues }, lastUpdated: Date.now() })),
      setLoading: (loading) => set({ loading }),
      setPricesAttempted: (pricesAttempted) => set({ pricesAttempted }),
      setSipValuesAttempted: (sipValuesAttempted) => set({ sipValuesAttempted }),
      goldPricePerGram: null,
      goldPriceAsOf: null,
      goldPriceLoading: false,
      goldPriceError: false,
      setGoldPrice: (goldPricePerGram, goldPriceAsOf) =>
        set({ goldPricePerGram, goldPriceAsOf, goldPriceLoading: false, goldPriceError: false }),
      setGoldPriceLoading: (goldPriceLoading) => set({ goldPriceLoading }),
      setGoldPriceError: (goldPriceError) => set({ goldPriceError }),
    }),
    {
      // Cache the last real fetched prices across page loads/refreshes, so
      // the next visit can show them instantly instead of an empty state
      // that has to wait out a fresh network round-trip first. A fresh
      // fetch still kicks off in the background and silently corrects
      // anything that's changed since — this only avoids the *wait*, it
      // doesn't skip the refresh.
      name: 'aurafin-live-prices-cache',
      partialize: (s) => ({
        prices: s.prices,
        previousCloses: s.previousCloses,
        sipValues: s.sipValues,
        lastUpdated: s.lastUpdated,
        goldPricePerGram: s.goldPricePerGram,
        goldPriceAsOf: s.goldPriceAsOf,
      }),
    }
  )
);

/** Resolve live LTP for a symbol, falling back to stored avg or computed price. */
export function resolveLivePrice(
  symbol: string | undefined,
  prices: Record<string, number>,
  fallback?: number
): number | undefined {
  if (!symbol) return fallback;
  const live = prices[symbol.toUpperCase()];
  return live ?? fallback;
}

/** Resolve yesterday's close for a symbol, if the last quote included one. */
export function resolvePreviousClose(
  symbol: string | undefined,
  previousCloses: Record<string, number>
): number | undefined {
  if (!symbol) return undefined;
  return previousCloses[symbol.toUpperCase()];
}

/** Resolve the live auto-calculated value for a linked SIP, keyed by scheme code. */
export function resolveSipLiveValue(
  symbol: string | undefined,
  sipValues: Record<string, SipLiveEntry>
): SipLiveEntry | undefined {
  if (!symbol) return undefined;
  return sipValues[symbol.trim()];
}
