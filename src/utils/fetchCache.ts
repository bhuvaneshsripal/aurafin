/** Tiny localStorage cache for the last successful response of a live-data
 *  endpoint, so a weak or missing connection can still show what was fetched
 *  last (and when) instead of an empty/"unavailable" state. */
const PREFIX = 'aurafin.cache.';

export interface Cached<T> {
  data: T;
  at: number;
}

export function readCache<T>(name: string): Cached<T> | null {
  try {
    const raw = localStorage.getItem(PREFIX + name);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.at === 'number' && 'data' in parsed ? (parsed as Cached<T>) : null;
  } catch {
    return null;
  }
}

export function writeCache<T>(name: string, data: T): void {
  try {
    localStorage.setItem(PREFIX + name, JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* quota/blocked: we just lose the offline fallback */
  }
}

/** Cache names for the market-data tables (market data isn't personal, so it
 *  doesn't need clearing on logout). */
export const CACHE_NAMES = { indian: 'indices-indian', global: 'indices-global' } as const;
