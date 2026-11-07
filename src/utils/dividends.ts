import type { Exchange, Market } from './stockDetail';

/** Past dividends for a stock (ex-date + amount per share), newest first. */
export interface DividendPayment {
  /** Ex-dividend date, ms since epoch */
  date: number;
  /** Amount per share, in the stock's currency */
  amount: number;
}
export interface DividendData {
  symbol: string;
  currency: string;
  dividends: DividendPayment[];
}
export interface DividendSummary {
  /** Paid anything in the last 12 months */
  paysNow: boolean;
  /** Has ever paid (in the last 10 years of data) */
  everPaid: boolean;
  /** Sum of the last 12 months, per share */
  ttmPerShare: number;
  /** Payments in the last 12 months */
  paymentsTtm: number;
  /** ttm / price, in percent (null without a price) */
  yieldPct: number | null;
  last: DividendPayment | null;
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const TTL = 6 * 60 * 60 * 1000;
const mem = new Map<string, { at: number; data: DividendData }>();
const inflight = new Map<string, Promise<DividendData>>();

const key = (symbol: string, market: Market, exchange: Exchange) => `${market}:${exchange}:${symbol.toUpperCase()}`;

/** Loads a stock's dividend history; kept in memory for a few hours and shared between callers. */
export function fetchDividends(symbol: string, market: Market, exchange: Exchange): Promise<DividendData> {
  const k = key(symbol, market, exchange);
  const hit = mem.get(k);
  if (hit && Date.now() - hit.at < TTL) return Promise.resolve(hit.data);
  const running = inflight.get(k);
  if (running) return running;
  const p = fetch(
    `/api/market/valuation?mode=dividends&symbol=${encodeURIComponent(symbol)}&market=${market}&exchange=${exchange}`
  )
    .then((r) => {
      if (!r.ok) throw new Error(`Dividend request failed (${r.status})`);
      return r.json() as Promise<DividendData>;
    })
    .then((data) => {
      mem.set(k, { at: Date.now(), data });
      return data;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

export function summarizeDividends(data: DividendData, price: number | null): DividendSummary {
  const cutoff = Date.now() - YEAR_MS;
  const recent = data.dividends.filter((d) => d.date >= cutoff);
  const ttmPerShare = recent.reduce((n, d) => n + d.amount, 0);
  return {
    paysNow: recent.length > 0,
    everPaid: data.dividends.length > 0,
    ttmPerShare,
    paymentsTtm: recent.length,
    yieldPct: price && price > 0 && ttmPerShare > 0 ? (ttmPerShare / price) * 100 : null,
    last: data.dividends[0] ?? null,
  };
}
