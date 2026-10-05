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
    const q = await fetchNseQuote(bare);
    return { ...q, source: 'nse' };
  } catch {
    // fall through to Yahoo
  }
  for (const c of [`${bare}.NS`, `${bare}.BO`]) {
    const q = await fetchYahooQuote(c).catch(() => null);
    if (q) return { ...q, source: 'yahoo' };
  }
  return null;
}
