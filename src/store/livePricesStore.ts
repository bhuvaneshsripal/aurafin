import { create } from 'zustand';

interface LivePricesState {
  prices: Record<string, number>;
  lastUpdated: number | null;
  loading: boolean;
  setPrices: (prices: Record<string, number>) => void;
  setLoading: (loading: boolean) => void;
}

export const useLivePricesStore = create<LivePricesState>((set) => ({
  prices: {},
  lastUpdated: null,
  loading: false,
  setPrices: (prices) => set({ prices, lastUpdated: Date.now(), loading: false }),
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
