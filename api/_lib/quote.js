// Shared live-quote resolver used by both the Vercel function
// (api/market/chart/[symbol].js) and the Vite dev middleware, so local and
// production behave identically.
//
// Routing rules:
//  - US market            -> Yahoo only.
//  - BSE-only symbols     -> (ticker ends in .BO, or is a numeric BSE scrip
//    code) skip NSE's API entirely: it can't know them, and asking it for
//    "NSE" (from "NSE.BO") was the reason National Stock Exchange's own
//    shares never got a live price. Try Yahoo, then BSE's own API.
//  - Everything else      -> NSE API first, then Yahoo (.NS then .BO).
import { fetchNseQuote } from './nse.js';

import { fetch } from './fetchTimeout.js';
// Tickers people commonly type that Yahoo/BSE know under a numeric BSE
// scrip code instead. NSE (National Stock Exchange of India) listed on BSE
// only, on 24 Sep 2026, scrip code 544937.
const BSE_CODE_ALIASES = {
  'NSE.BO': '544937',
  'NSEI.BO': '544937',
};

/**
 * The apps ask for prices every second, but the exchange feeds (and Groww / Yahoo behind them) only
 * tick every second or two, and NSE throttles callers that ask too often. So one upstream lookup per
 * symbol is shared by everyone asking within this window (and by requests that arrive while it is
 * still in flight). Lower it for fresher numbers; raise it if NSE starts refusing requests.
 */
const QUOTE_REFRESH_MS = 2000;

const toNumber = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
};

async function fetchYahooQuote(yahooSymbol) {
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = toNumber(meta?.regularMarketPrice ?? meta?.previousClose);
  if (price === undefined) return null;
  return {
    price,
    previousClose: toNumber(meta?.previousClose ?? meta?.chartPreviousClose),
    currency: meta?.currency ?? 'INR',
    asOf: toNumber(meta?.regularMarketTime) ? meta.regularMarketTime * 1000 : undefined,
  };
}

// BSE's own public quote endpoint — needs a browser-like Referer/Origin.
async function fetchBseQuote(scripCode) {
  const res = await fetch(
    `https://api.bseindia.com/BseIndiaAPI/api/getScripHeaderData?Debtflag=&scripcode=${encodeURIComponent(scripCode)}&seriesid=`,
    {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
        Referer: 'https://www.bseindia.com/',
        Origin: 'https://www.bseindia.com',
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  const price = toNumber(data?.CurrRate?.LTP ?? data?.Header?.LTP);
  if (price === undefined) return null;
  return { price, previousClose: toNumber(data?.Header?.PrevClose), currency: 'INR' };
}

// Groww's public price feed: it kept ticking through the Sunday Muhurat session when NSE's equity quote
// and Yahoo both stayed on Friday's close. Only used when those two are stale during trading hours.
const growwRecent = new Map(); // symbol -> { at, q }
async function growwQuote(symbol) {
  const hit = growwRecent.get(symbol);
  if (hit && Date.now() - hit.at < QUOTE_REFRESH_MS) return hit.q;
  let q = null;
  try {
    const res = await fetch(
      `https://groww.in/v1/api/stocks_data/v1/accord_points/exchange/NSE/segment/CASH/latest_prices_ohlc/${encodeURIComponent(symbol)}`,
      { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } }
    );
    if (res.ok) {
      const j = await res.json();
      const price = toNumber(j?.ltp);
      const ts = toNumber(j?.tsInMillis);
      // Groww's own day change is what its app shows, so the previous close is ltp - dayChange
      // (falls back to the `close` field when no day change is sent).
      const dayChange = typeof j?.dayChange === 'number' && Number.isFinite(j.dayChange) ? j.dayChange : undefined;
      const prevFromChange = price !== undefined && dayChange !== undefined ? toNumber(Math.round((price - dayChange) * 100) / 100) : undefined;
      const previousClose = prevFromChange ?? toNumber(j?.close);
      if (price !== undefined) q = { price, asOf: ts, previousClose };
    }
  } catch {
    /* no Groww price */
  }
  growwRecent.set(symbol, { at: Date.now(), q });
  return q;
}

const yahooRecent = new Map(); // symbol -> { at, q }
async function freshYahoo(sym) {
  const hit = yahooRecent.get(sym);
  if (hit && Date.now() - hit.at < QUOTE_REFRESH_MS) return hit.q;
  const q = await fetchYahooQuote(sym).catch(() => null);
  yahooRecent.set(sym, { at: Date.now(), q });
  return q;
}

// --- Previous close ---------------------------------------------------------------------------
// The price and the previous close of a quote ALWAYS come from the same source and the same snapshot,
// so "1D change" (price - previous close) is exactly what that exchange feed / Groww reports.
// (An earlier version replaced the previous close with one rebuilt from Yahoo's daily candles while the
// price came from NSE or Groww; when the two disagreed, the 1D change and % did not match Groww.)

const resolvedRecently = new Map(); // "IN:TCS" -> { at, promise }

/** Returns { price, previousClose, currency, source } or null. Shared for QUOTE_REFRESH_MS per symbol. */
export function resolveQuote(rawSymbol, market = 'IN') {
  const key = `${market}:${String(rawSymbol).trim().toUpperCase()}`;
  const now = Date.now();
  const hit = resolvedRecently.get(key);
  if (hit && now - hit.at < QUOTE_REFRESH_MS) return hit.promise;
  const promise = resolveQuoteUncached(rawSymbol, market);
  resolvedRecently.set(key, { at: now, promise });
  // A failed lookup is not kept: the next request tries the sources again straight away.
  const forget = () => {
    if (resolvedRecently.get(key)?.promise === promise) resolvedRecently.delete(key);
  };
  promise.then((q) => { if (!q) forget(); }, forget);
  if (resolvedRecently.size > 500) resolvedRecently.delete(resolvedRecently.keys().next().value);
  return promise;
}

async function resolveQuoteUncached(rawSymbol, market = 'IN') {
  const raw = String(rawSymbol).trim().toUpperCase();

  if (market === 'US') {
    const q = await fetchYahooQuote(raw).catch(() => null);
    return q ? { ...q, currency: q.currency ?? 'USD', source: 'yahoo' } : null;
  }

  const aliasCode = BSE_CODE_ALIASES[raw];
  const numericCode = aliasCode ?? (/^\d{5,6}(\.BO)?$/.test(raw) ? raw.replace(/\.BO$/, '') : null);
  const isBseOnly = !!numericCode || /\.BO$/.test(raw);

  if (isBseOnly) {
    const candidates = numericCode ? [`${numericCode}.BO`, raw] : [raw];
    for (const c of [...new Set(candidates)]) {
      const q = await fetchYahooQuote(c).catch(() => null);
      if (q) return { ...q, source: 'yahoo' };
    }
    if (numericCode) {
      const q = await fetchBseQuote(numericCode).catch(() => null);
      if (q) return { ...q, source: 'bse' };
    }
    return null;
  }

  const bare = raw.replace(/\.NS$/, '');
  // Price and previous close are ALWAYS taken together from ONE source. Groww and NSE are asked at
  // the same time; the one whose quote is newer wins (Groww on a tie, because Groww is the reference
  // people compare against: its last traded price and its previous close, which includes the Sunday
  // Muhurat session). NSE's own previous close can still point at the session before Muhurat.
  const [g, n] = await Promise.all([growwQuote(bare).catch(() => null), fetchNseQuote(bare).catch(() => null)]);
  const gOk = g && g.previousClose !== undefined && Math.abs(g.price / g.previousClose - 1) < 0.25;
  const nOk = n && n.previousClose !== undefined;
  if (gOk && (!nOk || g.asOf === undefined || n.asOf === undefined || g.asOf >= n.asOf)) {
    return { ...g, currency: 'INR', source: 'groww' };
  }
  if (nOk) return { ...n, source: 'nse' };
  if (g) return { ...g, currency: 'INR', source: 'groww' };
  if (n) return { ...n, source: 'nse' };
  // Both failed: fall through to Yahoo (which carries its own previous close)
  for (const c of [`${bare}.NS`, `${bare}.BO`]) {
    const q = await fetchYahooQuote(c).catch(() => null);
    if (q) return { ...q, source: 'yahoo' };
  }
  return null;
}
