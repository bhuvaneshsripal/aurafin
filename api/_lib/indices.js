// Live Indian benchmark index levels for the top-bar ticker, shared by the
// Vercel function (api/market/indices.js) and the Vite dev middleware.
//
// Each index lists Yahoo symbols to try in order (Yahoo is inconsistent
// about the newer NSE indices). The NSE ones also fall back to NSE's own
// allIndices feed, matched by its index name. Sensex only exists on BSE,
// so it is Yahoo-only.
import { fetchNseAllIndices } from './nse.js';

import { fetch } from './fetchTimeout.js';
const INDICES = [
  { key: 'nifty', name: 'NIFTY', yahoo: ['^NSEI'], nse: 'NIFTY 50' },
  { key: 'sensex', name: 'SENSEX', yahoo: ['^BSESN'] },
  { key: 'banknifty', name: 'BANKNIFTY', yahoo: ['^NSEBANK'], nse: 'NIFTY BANK' },
  { key: 'midcpnifty', name: 'MIDCPNIFTY', yahoo: ['NIFTY_MID_SELECT.NS', '^NSEMDCP50'], nse: 'NIFTY MIDCAP SELECT' },
  { key: 'finnifty', name: 'FINNIFTY', yahoo: ['NIFTY_FIN_SERVICE.NS', '^CNXFIN'], nse: 'NIFTY FINANCIAL SERVICES' },
];

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
};

async function yahooQuote(symbol) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1m&range=1d`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    const result = (await res.json())?.chart?.result?.[0];
    const meta = result?.meta;
    const price = num(meta?.regularMarketPrice);
    if (price === undefined) return null;
    // Today's opening level = first 1-minute candle's open (lets the app
    // back-fill "Open" even if it wasn't running at 9:15).
    const opens = result?.indicators?.quote?.[0]?.open;
    const open = Array.isArray(opens) ? num(opens.find((v) => num(v) !== undefined)) : undefined;
    return { price, previousClose: num(meta?.chartPreviousClose) ?? num(meta?.previousClose), open };
  } catch {
    return null;
  }
}

// The top bar polls once a second per open tab; share one upstream fetch
// between all callers inside that window instead of hammering Yahoo/NSE.
const CACHE_MS = 1000;
let cached = null; // { at, promise }

/** Returns the indices that could be fetched (in display order), or null if none could. */
export function fetchIndices() {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchIndicesUncached();
  cached = { at: now, promise };
  // Don't keep a failed/empty result around for the whole window.
  promise.then((r) => { if (!r && cached?.promise === promise) cached = null; }, () => { if (cached?.promise === promise) cached = null; });
  return promise;
}

async function fetchIndicesUncached() {
  // NSE's own feed is the fastest source for the NSE indices (Yahoo lags it by
  // a minute or more), so ask NSE first — one call covers every NSE index —
  // and only fall back to Yahoo for what it didn't return. Sensex is BSE-only,
  // so it comes from Yahoo; both run in parallel.
  const wantsNse = INDICES.some((idx) => idx.nse);
  const nsePromise = wantsNse ? fetchNseAllIndices().catch(() => []) : Promise.resolve([]);

  const yahooFirst = INDICES.map((idx) => !idx.nse);
  const results = await Promise.all(
    INDICES.map(async (idx, i) => (yahooFirst[i] ? yahooBySymbols(idx.yahoo) : null))
  );

  const all = await nsePromise;
  INDICES.forEach((idx, i) => {
    if (results[i] || !idx.nse) return;
    const row = all.find((r) => String(r?.index ?? '').toUpperCase() === idx.nse);
    const price = num(row?.last);
    if (price !== undefined) results[i] = { price, previousClose: num(row?.previousClose), open: num(row?.open) };
  });

  // Anything NSE didn't return: fall back to Yahoo.
  await Promise.all(
    INDICES.map(async (idx, i) => {
      if (!results[i]) results[i] = await yahooBySymbols(idx.yahoo);
    })
  );

  const out = INDICES.flatMap((idx, i) => (results[i] ? [{ key: idx.key, name: idx.name, ...results[i] }] : []));
  return out.length ? out : null;
}

async function yahooBySymbols(symbols) {
  for (const sym of symbols ?? []) {
    const q = await yahooQuote(sym);
    if (q) return q;
  }
  return null;
}
