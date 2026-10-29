/**
 * fetch() that can't hang forever and never reads from the HTTP cache.
 *
 * Live prices were polled with a bare fetch(): one request that stalled (weak
 * Wi-Fi, laptop waking from sleep) left the poller's "already fetching" flag
 * set for good, so prices silently stopped updating until a hard refresh.
 * `cache: 'no-store'` also guarantees a price is never an old cached response.
 */
export async function fetchWithTimeout(url: string, timeoutMs = 8000, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: 'no-store', ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}
