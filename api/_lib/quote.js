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
  if (hit && Date.now() - hit.at < 4000) return hit.q;
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
      if (price !== undefined) q = { price, asOf: ts, previousClose: toNumber(j?.close) };
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
  if (hit && Date.now() - hit.at < 4000) return hit.q;
  const q = await fetchYahooQuote(sym).catch(() => null);
  yahooRecent.set(sym, { at: Date.now(), q });
  return q;
}

// --- Previous close -------------------------------------------------------------------------
// The "previous close" that NSE / Yahoo's live quote carries can lag on days with an unusual session
// (e.g. the Sunday Diwali Muhurat session): it still holds the close from two sessions back, so every
// stock showed the previous day's whole move as "today's" change while the index (a different feed)
// was right. The close of the last session that finished BEFORE today comes straight from the daily
// candles, and is the same for the whole day, so it is looked up once per symbol per day.
const istDate = (ms) => new Date(ms + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const prevCloseCache = new Map(); // yahooSymbol -> { day, value, at }

async function lastCompletedClose(yahooSymbol) {
  const today = istDate(Date.now());
  const hit = prevCloseCache.get(yahooSymbol);
  if (hit && hit.day === today && (hit.value !== undefined || Date.now() - hit.at < 60_000)) return hit.value;
  let value;
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=7d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(4000) }
    );
    if (res.ok) {
      const r = (await res.json())?.chart?.result?.[0];
      const ts = r?.timestamp ?? [];
      const closes = r?.indicators?.quote?.[0]?.close ?? [];
      for (let i = ts.length - 1; i >= 0; i--) {
        if (istDate(ts[i] * 1000) < today && toNumber(closes[i]) !== undefined) {
          value = toNumber(closes[i]);
          break;
        }
      }
    }
  } catch {
    /* keep the quote's own previous close */
  }
  prevCloseCache.set(yahooSymbol, { day: today, value, at: Date.now() });
  return value;
}

async function withPrevClose(yahooSymbol, quote) {
  const prev = await lastCompletedClose(yahooSymbol);
  // Only accept a sane value (a bad candle must not create a fake 40% move).
  if (prev !== undefined && Math.abs(quote.price / prev - 1) < 0.5) return { ...quote, previousClose: prev };
  return quote;
}

/** Returns { price, previousClose, currency, source } or null. */
export async function resolveQuote(rawSymbol, market = 'IN') {
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
  try {
    let q = { ...(await fetchNseQuote(bare)), source: 'nse' };
    // NSE's equity quote can lag (it did not tick during the Sunday Muhurat session while Yahoo did).
    // In trading hours, if NSE's quote is older than 5 minutes, take Yahoo's price when it is newer.
    const ist = new Date(Date.now() + 5.5 * 3600 * 1000);
    const mins = ist.getUTCHours() * 60 + ist.getUTCMinutes();
    const stale = q.asOf === undefined || Date.now() - q.asOf > 5 * 60 * 1000;
    if (stale && mins >= 9 * 60 && mins <= 16 * 60) {
      const y = await freshYahoo(`${bare}.NS`);
      if (y && y.asOf !== undefined && Date.now() - y.asOf < 5 * 60 * 1000 && (q.asOf === undefined || y.asOf > q.asOf)) {
        q = { ...q, price: y.price, asOf: y.asOf, source: 'yahoo' };
      } else {
        const g = await growwQuote(bare);
        // Groww's timestamp must prove the price is live (within 5 min) before it replaces NSE's.
        if (g && g.asOf !== undefined && Date.now() - g.asOf < 5 * 60 * 1000 && (q.asOf === undefined || g.asOf > q.asOf)) {
          q = { ...q, price: g.price, asOf: g.asOf, source: 'groww' };
        }
      }
    }
    return withPrevClose(`${bare}.NS`, q);
  } catch {
    // fall through to Yahoo
  }
  for (const c of [`${bare}.NS`, `${bare}.BO`]) {
    const q = await fetchYahooQuote(c).catch(() => null);
    if (q) return withPrevClose(c, { ...q, source: 'yahoo' });
  }
  return null;
}
