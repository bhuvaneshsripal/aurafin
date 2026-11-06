import { create } from 'zustand';
import { useLivePricesStore } from './livePricesStore';

/**
 * A short, in-memory trail of each symbol's recent live prices (oldest first),
 * used to draw the tiny sparkline beside a holding. It is filled from the same
 * live quotes the app already polls — one sample per symbol at most every
 * SAMPLE_MS — so no extra network calls. It is not persisted: the trail
 * starts when the app opens and grows while it stays open.
 */
const SAMPLE_MS = 60_000;
const MAX_POINTS = 4;

interface PriceTrailState {
  trail: Record<string, number[]>;
}

export const usePriceTrailStore = create<PriceTrailState>(() => ({ trail: {} }));

const lastSample: Record<string, { at: number; price: number }> = {};

useLivePricesStore.subscribe((s, prev) => {
  if (s.prices === prev.prices) return;
  const now = Date.now();
  let next: Record<string, number[]> | null = null;
  for (const [sym, price] of Object.entries(s.prices)) {
    if (!Number.isFinite(price)) continue;
    const last = lastSample[sym];
    if (last && (now - last.at < SAMPLE_MS || last.price === price)) continue;
    lastSample[sym] = { at: now, price };
    if (!next) next = { ...usePriceTrailStore.getState().trail };
    next[sym] = [...(next[sym] ?? []), price].slice(-MAX_POINTS);
  }
  if (next) usePriceTrailStore.setState({ trail: next });
});
