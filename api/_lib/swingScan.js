// Swing-trading scan over the Nifty 200: daily candles from Yahoo, indicators
// and setup rules from swingMath.js. The whole result is cached (module-level
// here, plus the CDN cache header set by the endpoint) because daily candles
// only change once a day and a cold scan makes ~200 upstream requests.
import { fetch } from './fetchTimeout.js';
import { fetchNseIndexConstituents } from './nse.js';
import { analyse } from './swingMath.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONCURRENCY = 16;
const CACHE_MS = 15 * 60 * 1000;

// Used only if NSE's constituents list can't be fetched.
const NIFTY50_FALLBACK = ('ADANIENT ADANIPORTS APOLLOHOSP ASIANPAINT AXISBANK BAJAJ-AUTO BAJFINANCE BAJAJFINSV BPCL BHARTIARTL BRITANNIA CIPLA COALINDIA DRREDDY EICHERMOT GRASIM HCLTECH HDFCBANK HDFCLIFE HEROMOTOCO HINDALCO HINDUNILVR ICICIBANK ITC INDUSINDBK INFY JSWSTEEL KOTAKBANK LT M&M MARUTI NTPC NESTLEIND ONGC POWERGRID RELIANCE SBILIFE SBIN SUNPHARMA TCS TATACONSUM TATAMOTORS TATASTEEL TECHM TITAN ULTRACEMCO WIPRO SHRIRAMFIN TRENT')
  .split(' ')
  .map((symbol) => ({ symbol, name: symbol }));

let cache = null; // { at, result }

async function universe() {
  try {
    const rows = await fetchNseIndexConstituents('NIFTY 200');
    const list = rows
      .filter((r) => typeof r?.symbol === 'string' && r.meta?.companyName) // the first row is the index itself
      .map((r) => ({ symbol: r.symbol, name: r.meta.companyName }));
    if (list.length >= 50) return list;
  } catch {
    /* fall back below */
  }
  return NIFTY50_FALLBACK;
}

async function dailyBars(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1y`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const r = (await res.json())?.chart?.result?.[0];
  const q = r?.indicators?.quote?.[0];
  if (!r || !q) return null;
  const bars = [];
  for (let i = 0; i < (r.timestamp?.length ?? 0); i++) {
    const b = { o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume[i] };
    if ([b.o, b.h, b.l, b.c, b.v].every((x) => typeof x === 'number' && Number.isFinite(x))) bars.push(b);
  }
  return bars;
}

export async function runSwingScan() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.result;
  const list = await universe();
  const out = [];
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const item = list[next++];
      try {
        const bars = await dailyBars(item.symbol);
        const a = bars && analyse(bars);
        if (a) out.push({ symbol: item.symbol, name: item.name, ...a });
      } catch {
        /* skip this stock */
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  if (out.length === 0) return null;
  // Keep the chart series only for stocks with a setup, so the response stays small.
  const stocks = out
    .map((s) => (s.setup === 'none' ? { ...s, series: undefined } : s))
    .sort((a, b) => b.score - a.score);
  const result = { stocks, scanned: out.length, universe: list.length };
  cache = { at: Date.now(), result };
  return result;
}
