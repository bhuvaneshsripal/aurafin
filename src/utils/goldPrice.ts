/**
 * Live 24K gold price per gram (INR) — see api/market/gold.js for the
 * upstream sources and important caveats (global spot estimate, not an
 * exact city retail rate).
 */
const GOLD_BASE = '/api/market/gold';

export interface LiveGoldPrice {
  pricePerGram24k: number;
  currency: string;
  asOf: number;
}

export async function fetchLiveGoldPrice(): Promise<LiveGoldPrice | null> {
  try {
    const res = await fetch(GOLD_BASE);
    if (!res.ok) return null;
    const json = await res.json();
    const price = json?.pricePerGram24k;
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;
    return {
      pricePerGram24k: price,
      currency: typeof json?.currency === 'string' ? json.currency : 'INR',
      asOf: typeof json?.asOf === 'number' ? json.asOf : Date.now(),
    };
  } catch {
    return null;
  }
}
