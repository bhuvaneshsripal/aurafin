// Indian indices table (name, last, change, high, low, open, previous close)
// for the "Indian Indices" tab of the /indices page. Shared by the Vercel
// function (api/market/indian-indices.js) and the Vite dev middleware.
//
// NSE indices come from NSE's own allIndices feed (one request for all of
// them). BSE indices (and Sensex) aren't on NSE, so they come from Yahoo.
// An index that can't be fetched is simply left out of the table.
//
// To change what's shown, edit INDIAN_INDICES: `nse` is NSE's index name,
// `yahoo` is a list of Yahoo tickers to try in order.
import { fetchNseAllIndices } from './nse.js';

export const INDIAN_INDICES = [
  { key: 'niftypvtbank', name: 'NIFTY Private Bank', exchange: 'NSE', nse: ['NIFTY PRIVATE BANK'] },
  { key: 'niftymetal', name: 'NIFTY Metal', exchange: 'NSE', nse: ['NIFTY METAL'] },
  { key: 'bankex', name: 'Bse Bankex', exchange: 'BSE', yahoo: ['BSE-BANK.BO'] },
  { key: 'midcapselect', name: 'Nifty Midcap Select', exchange: 'NSE', nse: ['NIFTY MIDCAP SELECT'] },
  { key: 'finnifty', name: 'Nifty Financial Services', exchange: 'NSE', nse: ['NIFTY FINANCIAL SERVICES'], yahoo: ['NIFTY_FIN_SERVICE.NS', '^CNXFIN'] },
  { key: 'niftypharma', name: 'NIFTY Pharma', exchange: 'NSE', nse: ['NIFTY PHARMA'] },
  { key: 'niftyit', name: 'NIFTY IT', exchange: 'NSE', nse: ['NIFTY IT'] },
  { key: 'nifty50', name: 'NIFTY 50', exchange: 'NSE', nse: ['NIFTY 50'], yahoo: ['^NSEI'] },
  { key: 'totalmarket', name: 'Nifty Total Market', exchange: 'NSE', nse: ['NIFTY TOTAL MARKET'] },
  { key: 'bsemidcap', name: 'Bse Midcap', exchange: 'BSE', yahoo: ['BSE-MIDCAP.BO'] },
  { key: 'bsesmallcap', name: 'Bse Smallcap', exchange: 'BSE', yahoo: ['BSE-SMLCAP.BO'] },
  { key: 'midcap100', name: 'NIFTY Midcap 100', exchange: 'NSE', nse: ['NIFTY MIDCAP 100'] },
  { key: 'midcap150', name: 'NIFTY MIDCAP 150', exchange: 'NSE', nse: ['NIFTY MIDCAP 150'] },
  { key: 'midcap50', name: 'NIFTY MIDCAP 50', exchange: 'NSE', nse: ['NIFTY MIDCAP 50'] },
  { key: 'indiavix', name: 'India Vix', exchange: 'NSE', nse: ['INDIA VIX'], yahoo: ['^INDIAVIX'] },
  { key: 'niftybank', name: 'NIFTY Bank', exchange: 'NSE', nse: ['NIFTY BANK'], yahoo: ['^NSEBANK'] },
  { key: 'smallcap250', name: 'NIFTY SMALLCAP 250', exchange: 'NSE', nse: ['NIFTY SMALLCAP 250'] },
  { key: 'media', name: 'Nifty Media Index', exchange: 'NSE', nse: ['NIFTY MEDIA'] },
  { key: 'next50', name: 'Nifty Next 50', exchange: 'NSE', nse: ['NIFTY NEXT 50'] },
  { key: 'bse100', name: 'Bse 100', exchange: 'BSE', yahoo: ['BSE-100.BO'] },
  { key: 'auto', name: 'NIFTY Auto', exchange: 'NSE', nse: ['NIFTY AUTO'] },
  { key: 'nifty100', name: 'NIFTY 100', exchange: 'NSE', nse: ['NIFTY 100'] },
  { key: 'smallcap100', name: 'NIFTY Smallcap 100', exchange: 'NSE', nse: ['NIFTY SMALLCAP 100'] },
  { key: 'nifty500', name: 'NIFTY 500', exchange: 'NSE', nse: ['NIFTY 500'] },
  { key: 'bseipo', name: 'Bse IPO', exchange: 'BSE', yahoo: ['BSE-IPO.BO'] },
  { key: 'fmcg', name: 'Nifty FMCG', exchange: 'NSE', nse: ['NIFTY FMCG'] },
  { key: 'psubank', name: 'NIFTY PSU Bank', exchange: 'NSE', nse: ['NIFTY PSU BANK'] },
  { key: 'realty', name: 'NIFTY Realty', exchange: 'NSE', nse: ['NIFTY REALTY'] },
  { key: 'commodities', name: 'NIFTY Commodities', exchange: 'NSE', nse: ['NIFTY COMMODITIES'] },
  { key: 'sensex', name: 'Sensex', exchange: 'BSE', yahoo: ['^BSESN'] },
];

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : undefined;
};

async function yahooRow(symbol) {
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
    const opens = result?.indicators?.quote?.[0]?.open ?? [];
    return {
      price,
      previousClose: num(meta?.chartPreviousClose) ?? num(meta?.previousClose),
      high: num(meta?.regularMarketDayHigh),
      low: num(meta?.regularMarketDayLow),
      open: opens.find((v) => num(v) !== undefined),
    };
  } catch {
    return null;
  }
}

// Shared between callers inside one second (the table polls every couple of seconds per tab).
let cachedIndian = null; // { at, promise }
export function fetchIndianIndices() {
  const now = Date.now();
  if (cachedIndian && now - cachedIndian.at < 1000) return cachedIndian.promise;
  const promise = fetchIndianIndicesUncached();
  cachedIndian = { at: now, promise };
  promise.then(
    (r) => { if (!r && cachedIndian?.promise === promise) cachedIndian = null; },
    () => { if (cachedIndian?.promise === promise) cachedIndian = null; }
  );
  return promise;
}

async function fetchIndianIndicesUncached() {
  // NSE: one call, then pick rows by name.
  let nseRows = [];
  if (INDIAN_INDICES.some((i) => i.nse)) {
    try {
      nseRows = await fetchNseAllIndices();
    } catch {
      nseRows = [];
    }
  }
  const nseByName = new Map(nseRows.map((r) => [String(r?.index ?? '').toUpperCase(), r]));

  const rows = await Promise.all(
    INDIAN_INDICES.map(async (idx) => {
      const nseRow = idx.nse?.map((n) => nseByName.get(n)).find(Boolean);
      const price = num(nseRow?.last);
      if (price !== undefined) {
        return {
          price,
          previousClose: num(nseRow.previousClose),
          high: num(nseRow.high),
          low: num(nseRow.low),
          open: num(nseRow.open),
        };
      }
      for (const sym of idx.yahoo ?? []) {
        const r = await yahooRow(sym);
        if (r) return r;
      }
      return null;
    })
  );

  const out = INDIAN_INDICES.flatMap((idx, i) =>
    rows[i] ? [{ key: idx.key, name: idx.name, exchange: idx.exchange, ...rows[i] }] : []
  );
  return out.length ? out : null;
}
