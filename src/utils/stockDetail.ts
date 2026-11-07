import { fetchWithTimeout } from './fetchWithTimeout';

/** Types, fetchers and formatters for the full-page stock view (pages/StockQuote.tsx).
 *  Served by /api/market/valuation?mode=history|detail — see api/_lib/stockDetail.js. */

export type Market = 'IN' | 'US';
export type Exchange = 'NSE' | 'BSE';

export const RANGE_KEYS = ['1D', '1W', '1M', '3M', '6M', '1Y', '3Y', '5Y', 'ALL'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];
export const RANGE_LABEL: Record<RangeKey, string> = {
  '1D': '1D', '1W': '1W', '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1Y', '3Y': '3Y', '5Y': '5Y', ALL: 'All',
};

/** [time ms, open, high, low, close, volume] */
export type Candle = [number, number, number, number, number, number];

export interface StockHistory {
  symbol: string;
  range: RangeKey;
  currency: string;
  timezone: string;
  previousClose: number | null;
  points: Candle[];
}

export interface FinancialPeriod {
  date: string;
  revenue: number | null;
  profit: number | null;
  revenueYoy: number | null;
  profitYoy: number | null;
}
export interface GrowthFigures {
  ttm: number | null;
  /** 'ttm' = last four quarters vs the four before; 'annual' = latest year vs the one before. */
  basis: 'ttm' | 'annual' | null;
  cagr3: number | null;
}
export interface HoldingQuarter {
  date: string;
  promoters: number;
  public: number;
  dii: number | null;
  fii: number | null;
}

export interface StockDetail {
  symbol: string;
  yahooSymbol: string;
  name: string | null;
  currency: string;
  exchange: 'NSE' | 'BSE' | 'US';
  performance: {
    open: number | null;
    previousClose: number | null;
    dayLow: number | null;
    dayHigh: number | null;
    weekLow52: number | null;
    weekHigh52: number | null;
    volume: number | null;
    lowerCircuit: number | null;
    upperCircuit: number | null;
  };
  fundamentals: {
    marketCap: number | null;
    pe: number | null;
    pb: number | null;
    industryPe: number | null;
    debtToEquity: number | null;
    roe: number | null;
    eps: number | null;
    dividendYield: number | null;
    bookValue: number | null;
    faceValue: number | null;
  };
  financials: {
    quarterly: FinancialPeriod[];
    yearly: FinancialPeriod[];
    growth: { revenue: { quarterly: GrowthFigures }; profit: { quarterly: GrowthFigures } };
  };
  shareholding: HoldingQuarter[];
  about: {
    description: string | null;
    ceo: string | null;
    industry: string | null;
    sector: string | null;
    website: string | null;
    employees: number | null;
    founded: number | null;
  };
  asOf: string;
}

const BASE = '/api/market/valuation';

async function getJson<T>(url: string, timeoutMs: number): Promise<T> {
  const res = await fetchWithTimeout(url, timeoutMs);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

const q = (symbol: string, market: Market, exchange: Exchange) =>
  `symbol=${encodeURIComponent(symbol)}&market=${market}&exchange=${exchange}`;

export const fetchStockHistory = (symbol: string, market: Market, exchange: Exchange, range: RangeKey) =>
  getJson<StockHistory>(`${BASE}?mode=history&${q(symbol, market, exchange)}&range=${range}`, 12000);

// Company details barely change within minutes, so a copy is kept in memory and in
// sessionStorage: reopening a stock shows it instantly while a fresh copy loads behind it.
const DETAIL_KEY = (symbol: string, market: Market, exchange: Exchange) => `aurafin.detail.${market}.${exchange}.${symbol.toUpperCase()}`;
const DETAIL_MAX_AGE_MS = 30 * 60 * 1000;
const detailMem = new Map<string, { data: StockDetail; at: number }>();

export function getCachedStockDetail(symbol: string, market: Market, exchange: Exchange): StockDetail | null {
  const key = DETAIL_KEY(symbol, market, exchange);
  const m = detailMem.get(key);
  if (m && Date.now() - m.at < DETAIL_MAX_AGE_MS) return m.data;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: StockDetail; at: number };
    if (Date.now() - parsed.at > DETAIL_MAX_AGE_MS) return null;
    detailMem.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

function saveStockDetail(symbol: string, market: Market, exchange: Exchange, data: StockDetail) {
  const key = DETAIL_KEY(symbol, market, exchange);
  const entry = { data, at: Date.now() };
  detailMem.set(key, entry);
  try { sessionStorage.setItem(key, JSON.stringify(entry)); } catch { /* storage full or blocked */ }
}

/** Loads the details; one fast automatic retry hides a one-off slow or failed answer from the source. */
export async function fetchStockDetail(symbol: string, market: Market, exchange: Exchange): Promise<StockDetail> {
  const url = `${BASE}?mode=detail&${q(symbol, market, exchange)}`;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const d = await getJson<StockDetail>(url, 15000);
      saveStockDetail(symbol, market, exchange, d);
      return d;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  throw lastErr;
}

// ------------------------------------------------------------------ formatting

const LOCALE = (m: Market) => (m === 'US' ? 'en-US' : 'en-IN');
export const currencySymbol = (m: Market) => (m === 'US' ? '$' : '₹');

/** 4,712.50 — no currency sign. */
export const fmtNum = (n: number | null | undefined, m: Market, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n)
    ? '—'
    : n.toLocaleString(LOCALE(m), { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** ₹4,785.00 */
export const fmtPrice = (n: number | null | undefined, m: Market) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${currencySymbol(m)}${fmtNum(n, m)}`;

/** 5,46,122 */
export const fmtInt = (n: number | null | undefined, m: Market) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString(LOCALE(m));

/** ₹1,20,434Cr for India; $3.41T / $94.04B / $812M for the US. */
export function fmtCompact(n: number | null | undefined, m: Market): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  if (m === 'IN') return `₹${Math.round(n / 1e7).toLocaleString('en-IN')}Cr`;
  const a = Math.abs(n);
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  return `$${Math.round(n / 1e6).toLocaleString('en-US')}M`;
}

/** Divisor that turns a raw revenue/profit figure into the unit the financial chart is drawn in. */
export const financialUnit = (m: Market) => (m === 'IN' ? 1e7 : 1e9);

/** +12.05% / -3.92% */
export const fmtSigned = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : `${n >= 0 ? '+' : '-'}${Math.abs(n).toFixed(digits)}%`;

/** "2026-09-30" -> "Sep '26" */
export function quarterLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} '${String(d.getUTCFullYear()).slice(-2)}`;
}

/** Time under the chart's crosshair: "11:36 AM" for a day, with the date for longer ranges. */
export function pointTimeLabel(ms: number, range: RangeKey, tz: string): string {
  const opts = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-IN', { timeZone: tz, ...o }).format(ms);
  if (range === '1D') return opts({ hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase();
  if (range === '1W' || range === '1M')
    return `${opts({ day: '2-digit', month: 'short' })}, ${opts({ hour: 'numeric', minute: '2-digit', hour12: true }).toUpperCase()}`;
  return opts({ day: '2-digit', month: 'short', year: 'numeric' });
}
