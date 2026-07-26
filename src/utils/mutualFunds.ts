import type { SipInstallmentPoint } from './assetValues';

/** mfapi.in — free, no-key Indian mutual fund NAV API, proxied in dev via vite.config.ts */
const MF_BASE = '/api/mf';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * mfapi.in is a free, community-run API with no uptime guarantee — a single
 * request can time out or get rate-limited even when the fund/scheme code
 * is perfectly valid. Retry a few times with backoff, and give each attempt
 * a hard timeout so a slow/hanging response (common on Vercel's serverless
 * proxy under load) fails fast enough to retry instead of stalling the UI.
 */
async function fetchJsonWithRetry(url: string, retries = 3, timeoutMs = 8000): Promise<unknown | null> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (res.ok) return await res.json();
      // Retry on rate-limit / transient server errors; don't bother for 4xx like a bad code.
      if (res.status !== 429 && res.status < 500) return null;
    } catch {
      // network error, abort, or timeout — fall through to retry
    } finally {
      clearTimeout(timer);
    }
    if (attempt < retries) await sleep(500 * (attempt + 1));
  }
  return null;
}

export interface MfSearchResult {
  schemeCode: number;
  schemeName: string;
}

interface NavPoint {
  /** dd-mm-yyyy, as returned by mfapi.in */
  date: string;
  nav: number;
}

export interface FundNavHistory {
  schemeCode: number;
  schemeName: string;
  latestNav: number;
  latestDate: string;
  /** Ascending by date. */
  history: NavPoint[];
}

/**
 * Search mutual fund schemes by name.
 * Returns `[]` for a genuine "no matches" result, or `null` if the request
 * itself failed (proxy down, network error, bad response) — callers should
 * treat these differently so a real failure doesn't look like "no results".
 */
export async function searchMutualFunds(query: string): Promise<MfSearchResult[] | null> {
  const q = query.trim();
  if (q.length < 3) return [];
  const json = await fetchJsonWithRetry(`${MF_BASE}/search?q=${encodeURIComponent(q)}`);
  if (!Array.isArray(json)) return null;
  return json
    .filter((r: unknown): r is { schemeCode: number | string; schemeName: string } => {
      const rec = r as Record<string, unknown> | null;
      return !!rec && rec.schemeCode !== undefined && typeof rec.schemeName === 'string';
    })
    .slice(0, 20)
    .map((r) => ({ schemeCode: Number(r.schemeCode), schemeName: r.schemeName }));
}

const navCache = new Map<number, FundNavHistory>();

// NAV only updates once a day (after market close), so a same-day cached
// copy is never actually stale. Persisting it means a refresh — or a
// transient mfapi.in hiccup — doesn't lose today's already-fetched data.
const NAV_STORAGE_PREFIX = 'aurafin-nav-';
const NAV_STORAGE_MAX_AGE_MS = 20 * 60 * 60 * 1000; // 20h — comfortably under a day

interface StoredNav {
  fetchedAt: number;
  data: FundNavHistory;
}

function readStoredNav(schemeCode: number): StoredNav | null {
  try {
    const raw = localStorage.getItem(NAV_STORAGE_PREFIX + schemeCode);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredNav;
    if (!parsed?.data?.history?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredNav(schemeCode: number, data: FundNavHistory) {
  try {
    localStorage.setItem(
      NAV_STORAGE_PREFIX + schemeCode,
      JSON.stringify({ fetchedAt: Date.now(), data } satisfies StoredNav)
    );
  } catch {
    // Storage full/unavailable — the in-memory cache still covers this session.
  }
}

/**
 * Fetch full NAV history for a scheme. Cached in-memory for the session and
 * in localStorage across refreshes; a same-day cached copy is returned
 * without hitting the network at all, and if a fresh fetch fails, we fall
 * back to whatever's cached (even if a bit stale) rather than surfacing an
 * error for what's usually just a transient hiccup.
 */
export async function fetchFundNavHistory(schemeCode: number): Promise<FundNavHistory | null> {
  const memCached = navCache.get(schemeCode);
  if (memCached) return memCached;

  const stored = readStoredNav(schemeCode);
  if (stored && Date.now() - stored.fetchedAt < NAV_STORAGE_MAX_AGE_MS) {
    navCache.set(schemeCode, stored.data);
    return stored.data;
  }

  const json = await fetchJsonWithRetry(`${MF_BASE}/${schemeCode}`);
  if (!json || typeof json !== 'object') {
    // Fetch failed — fall back to whatever we have cached, even if stale,
    // rather than showing "couldn't fetch" when yesterday's NAV is still
    // a perfectly reasonable value to show.
    if (stored) {
      navCache.set(schemeCode, stored.data);
      return stored.data;
    }
    return null;
  }

  const rows: unknown[] = Array.isArray((json as { data?: unknown }).data)
    ? (json as { data: unknown[] }).data
    : [];
  const history: NavPoint[] = rows
    .map((r) => {
      const rec = r as Record<string, unknown>;
      return { date: String(rec.date), nav: Number(rec.nav) };
    })
    .filter((r) => Number.isFinite(r.nav) && r.nav > 0)
    .reverse(); // mfapi.in returns newest first

  if (history.length === 0) {
    if (stored) {
      navCache.set(schemeCode, stored.data);
      return stored.data;
    }
    return null;
  }
  const latest = history[history.length - 1];
  const meta = (json as { meta?: { scheme_name?: unknown } }).meta;

  const result: FundNavHistory = {
    schemeCode,
    schemeName: typeof meta?.scheme_name === 'string' ? meta.scheme_name : '',
    latestNav: latest.nav,
    latestDate: latest.date,
    history,
  };
  navCache.set(schemeCode, result);
  writeStoredNav(schemeCode, result);
  return result;
}

function parseDdMmYyyy(d: string): number {
  const [dd, mm, yyyy] = d.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd).getTime();
}

/** NAV in effect on/immediately before an ISO date, falling back to the
 *  earliest known NAV if the date predates the fund's history. */
function navOnOrBefore(history: NavPoint[], isoDate: string): number | undefined {
  const target = new Date(isoDate).getTime();
  let best: NavPoint | undefined;
  for (const point of history) {
    const t = parseDdMmYyyy(point.date);
    if (t <= target && (!best || t > parseDdMmYyyy(best.date))) best = point;
  }
  return best?.nav ?? history[0]?.nav;
}

export interface SipLiveValue {
  value: number;
  units: number;
}

/**
 * Values a SIP automatically: "buys" units at the NAV in effect on each
 * installment date, then prices the accumulated units at the latest NAV.
 * This is what powers the auto-calculated Current Value field.
 */
export function computeSipLiveValue(
  installments: SipInstallmentPoint[],
  navHistory: FundNavHistory
): SipLiveValue {
  let units = 0;
  for (const inst of installments) {
    const nav = navOnOrBefore(navHistory.history, inst.date);
    if (nav && nav > 0) units += inst.amount / nav;
  }
  return { value: units * navHistory.latestNav, units };
}
