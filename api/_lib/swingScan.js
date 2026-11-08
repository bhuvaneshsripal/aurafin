// Swing-trading scan: daily candles from Yahoo, indicators and setup rules from swingMath.js.
//
// The scan is done in batches (offset / limit) so a wide universe such as the Nifty 500 never has
// to finish inside one serverless call: the page asks for batch after batch and fills in as they
// arrive. Finished stocks are remembered per symbol (daily candles only change once a day), so
// repeating a batch, or rescanning, is cheap.
import { fetch } from './fetchTimeout.js';
import { fetchNseIndexConstituents } from './nse.js';
import { analyse } from './swingMath.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CONCURRENCY = 12;
const STOCK_CACHE_MS = 15 * 60 * 1000;
const UNIVERSE_CACHE_MS = 6 * 60 * 60 * 1000;
export const DEFAULT_BATCH = 60;

export const SWING_INDEXES = ['NIFTY 50', 'NIFTY 200', 'NIFTY 500'];

// Used only if NSE's constituents list can't be fetched.
const NIFTY50_FALLBACK = ('ADANIENT ADANIPORTS APOLLOHOSP ASIANPAINT AXISBANK BAJAJ-AUTO BAJFINANCE BAJAJFINSV BPCL BHARTIARTL BRITANNIA CIPLA COALINDIA DRREDDY EICHERMOT GRASIM HCLTECH HDFCBANK HDFCLIFE HEROMOTOCO HINDALCO HINDUNILVR ICICIBANK ITC INDUSINDBK INFY JSWSTEEL KOTAKBANK LT M&M MARUTI NTPC NESTLEIND ONGC POWERGRID RELIANCE SBILIFE SBIN SUNPHARMA TCS TATACONSUM TATAMOTORS TATASTEEL TECHM TITAN ULTRACEMCO WIPRO SHRIRAMFIN TRENT')
  .split(' ')
  .map((symbol) => ({ symbol, name: symbol }));

const universeCache = new Map(); // index -> { at, list }
const stockCache = new Map(); // symbol -> { at, entry } (entry is null when the stock couldn't be scanned)

async function universe(index) {
  const hit = universeCache.get(index);
  if (hit && Date.now() - hit.at < UNIVERSE_CACHE_MS) return hit.list;
  try {
    const rows = await fetchNseIndexConstituents(index);
    const list = rows
      .filter((r) => typeof r?.symbol === 'string' && r.meta?.companyName) // the first row is the index itself
      .map((r) => ({ symbol: r.symbol, name: r.meta.companyName }));
    if (list.length >= 30) {
      universeCache.set(index, { at: Date.now(), list });
      return list;
    }
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

/** One quick retry: a single dropped Yahoo request must not silently remove a stock from the scan. */
async function barsWithRetry(symbol) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const bars = await dailyBars(symbol);
      if (bars) return bars;
    } catch {
      /* timeout / network error: retry once */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

async function scanOne(item) {
  const hit = stockCache.get(item.symbol);
  if (hit && Date.now() - hit.at < STOCK_CACHE_MS) return hit.entry;
  const bars = await barsWithRetry(item.symbol);
  const a = bars && analyse(bars);
  let entry = null;
  if (a) {
    // Full chart series only for stocks with a setup; the rest keep just the price line, so a
    // 500-stock response stays small.
    const series = a.setup === 'none' ? { c: a.series.c, e20: [], e50: [] } : a.series;
    entry = { symbol: item.symbol, name: item.name, ...a, series };
  }
  // A failed fetch is only remembered briefly, so the next rescan tries it again.
  stockCache.set(item.symbol, { at: entry ? Date.now() : Date.now() - STOCK_CACHE_MS + 30_000, entry });
  return entry;
}

export async function runSwingScan({ index = 'NIFTY 200', offset = 0, limit = DEFAULT_BATCH } = {}) {
  const idx = SWING_INDEXES.includes(index) ? index : 'NIFTY 200';
  const list = await universe(idx);
  const start = Math.max(0, Math.min(Number(offset) || 0, list.length));
  const size = Math.max(1, Math.min(Number(limit) || DEFAULT_BATCH, 120));
  const slice = list.slice(start, start + size);

  const out = [];
  let failed = 0;
  let next = 0;
  const worker = async () => {
    while (next < slice.length) {
      const item = slice[next++];
      try {
        const entry = await scanOne(item);
        if (entry) out.push(entry);
        else failed++;
      } catch {
        failed++;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, slice.length) }, worker));

  if (out.length === 0 && failed > 0 && start === 0) return null;
  const end = start + slice.length;
  return {
    index: idx,
    stocks: out.sort((a, b) => b.score - a.score),
    scanned: out.length,
    failed,
    universe: list.length,
    offset: start,
    nextOffset: end < list.length ? end : null,
  };
}
