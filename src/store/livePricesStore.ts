import { create } from 'zustand';
import type { Asset } from '../types';

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
  /** Keyed by mfapi.in scheme code (i.e. the asset's `symbol` for SIPs). */
  sipValues: Record<string, SipLiveEntry>;
  lastUpdated: number | null;
  loading: boolean;
  setPrices: (prices: Record<string, number>) => void;
  setSipValues: (sipValues: Record<string, SipLiveEntry>) => void;
  setLoading: (loading: boolean) => void;
  /** Live 24K gold rate (₹/gram) polled by useLiveGoldPrice whenever the
   *  person holds a Gold asset — see src/utils/goldPrice.ts. */
  goldPricePerGram: number | null;
  goldPriceAsOf: number | null;
  goldPriceLoading: boolean;
  goldPriceError: boolean;
  setGoldPrice: (pricePerGram: number, asOf: number) => void;
  setGoldPriceLoading: (loading: boolean) => void;
  setGoldPriceError: (error: boolean) => void;
  /**
   * True once the corresponding live-data hook has completed its first
   * fetch attempt (success or failure) since the page loaded. Used to hold
   * off rendering totals that depend on live prices until the real number
   * is known, instead of briefly showing the stale last-saved `asset.value`
   * and then correcting a few seconds later.
   */
  equitiesInitialized: boolean;
  sipInitialized: boolean;
  goldInitialized: boolean;
  setEquitiesInitialized: () => void;
  setSipInitialized: () => void;
  setGoldInitialized: () => void;
}

export const useLivePricesStore = create<LivePricesState>((set) => ({
  prices: {},
  sipValues: {},
  lastUpdated: null,
  loading: false,
  setPrices: (prices) => set({ prices, lastUpdated: Date.now(), loading: false }),
  setSipValues: (sipValues) =>
    set((s) => ({ sipValues: { ...s.sipValues, ...sipValues }, lastUpdated: Date.now() })),
  setLoading: (loading) => set({ loading }),
  goldPricePerGram: null,
  goldPriceAsOf: null,
  goldPriceLoading: false,
  goldPriceError: false,
  setGoldPrice: (goldPricePerGram, goldPriceAsOf) =>
    set({ goldPricePerGram, goldPriceAsOf, goldPriceLoading: false, goldPriceError: false }),
  setGoldPriceLoading: (goldPriceLoading) => set({ goldPriceLoading }),
  setGoldPriceError: (goldPriceError) => set({ goldPriceError }),
  equitiesInitialized: false,
  sipInitialized: false,
  goldInitialized: false,
  setEquitiesInitialized: () => set({ equitiesInitialized: true }),
  setSipInitialized: () => set({ sipInitialized: true }),
  setGoldInitialized: () => set({ goldInitialized: true }),
}));

/**
 * True once every live-data source relevant to the given assets has
 * completed at least one fetch attempt. Callers use this to decide when
 * it's safe to display totals that depend on live prices/SIP values/gold
 * rate, so a stale fallback number never flashes on screen before the real
 * one arrives.
 */
export function useIsLiveDataReady(assets: Pick<Asset, 'assetClass' | 'symbol' | 'quantity'>[]) {
  const equitiesInitialized = useLivePricesStore((s) => s.equitiesInitialized);
  const sipInitialized = useLivePricesStore((s) => s.sipInitialized);
  const goldInitialized = useLivePricesStore((s) => s.goldInitialized);

  const needsEquities = assets.some((a) => a.symbol && a.quantity && a.quantity > 0);
  const needsSip = assets.some(
    (a) => a.assetClass === 'sip' && !!a.symbol && /^\d+$/.test(a.symbol)
  );
  const needsGold = assets.some((a) => a.assetClass === 'gold');

  return (
    (!needsEquities || equitiesInitialized) &&
    (!needsSip || sipInitialized) &&
    (!needsGold || goldInitialized)
  );
}

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

/** Resolve the live auto-calculated value for a linked SIP, keyed by scheme code. */
export function resolveSipLiveValue(
  symbol: string | undefined,
  sipValues: Record<string, SipLiveEntry>
): SipLiveEntry | undefined {
  if (!symbol) return undefined;
  return sipValues[symbol.trim()];
}
