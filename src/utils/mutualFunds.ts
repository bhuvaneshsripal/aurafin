import type { SipInstallmentPoint } from './assetValues';

/** mfapi.in — free, no-key Indian mutual fund NAV API, proxied in dev via vite.config.ts */
const MF_BASE = '/api/mf';

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
  try {
    const res = await fetch(`${MF_BASE}/search?q=${encodeURIComponent(q)}`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!Array.isArray(json)) return null;
    return json
      .filter((r: unknown): r is { schemeCode: number | string; schemeName: string } => {
        const rec = r as Record<string, unknown> | null;
        return !!rec && rec.schemeCode !== undefined && typeof rec.schemeName === 'string';
      })
      .slice(0, 20)
      .map((r) => ({ schemeCode: Number(r.schemeCode), schemeName: r.schemeName }));
  } catch {
    return null;
  }
}

const navCache = new Map<number, FundNavHistory>();

/** Fetch full NAV history for a scheme (cached in-memory for the session). */
export async function fetchFundNavHistory(schemeCode: number): Promise<FundNavHistory | null> {
  const cached = navCache.get(schemeCode);
  if (cached) return cached;

  try {
    const res = await fetch(`${MF_BASE}/${schemeCode}`);
    if (!res.ok) return null;
    const json = await res.json();
    const rows: unknown[] = Array.isArray(json?.data) ? json.data : [];
    const history: NavPoint[] = rows
      .map((r) => {
        const rec = r as Record<string, unknown>;
        return { date: String(rec.date), nav: Number(rec.nav) };
      })
      .filter((r) => Number.isFinite(r.nav) && r.nav > 0)
      .reverse(); // mfapi.in returns newest first

    if (history.length === 0) return null;
    const latest = history[history.length - 1];

    const result: FundNavHistory = {
      schemeCode,
      schemeName: typeof json?.meta?.scheme_name === 'string' ? json.meta.scheme_name : '',
      latestNav: latest.nav,
      latestDate: latest.date,
      history,
    };
    navCache.set(schemeCode, result);
    return result;
  } catch {
    return null;
  }
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
