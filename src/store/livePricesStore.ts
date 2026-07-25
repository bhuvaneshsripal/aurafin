import { create } from 'zustand';

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
}));

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
