// Every NSE stock with today's traded volume, so the High volume page can list the whole market
// (not just the top few). Sources, merged by symbol:
//   1. NSE "NIFTY TOTAL MARKET" (about 750 stocks; falls back to NIFTY 500): price, % change, volume,
//      day / 52-week range.
//   2. NSE "most active by volume": makes sure the heaviest-traded names are present even if they sit
//      outside that index.
//   3. NSE "volume gainers": carries the 1-week average volume, so we can show how unusual today's
//      volume is.
import {
  fetchNseIndexConstituents,
  fetchNseMostActiveByVolume,
  fetchNseVolumeGainers,
} from './nse.js';
import { fetch } from './fetchTimeout.js';
import { NIFTY50_FALLBACK } from './swingScan.js';

// NSE often rejects the first call on a cold session (it drops the cookie and the next call works),
// so every NSE table gets one retry; the cookie is re-fetched in between.
async function retry(fn) {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 300));
    return fn();
  }
}

// Last good result, served if NSE is down for a moment (warm instances only).
let lastGood = null; // { at, rows }
const STALE_OK_MS = 15 * 60 * 1000;

// Used only when NSE can't be reached at all: today's volume for the Nifty 50 from Yahoo daily candles.
export async function fetchVolumeFor(symbol) {
  const sym = String(symbol ?? '').trim().toUpperCase();
  return /^[A-Z0-9&-]{1,20}$/.test(sym) ? yahooVolume(sym) : null;
}

async function yahooVolume(symbol) {
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}.NS?interval=1d&range=1mo`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!res.ok) return null;
    const r = (await res.json())?.chart?.result?.[0];
    const q = r?.indicators?.quote?.[0];
    if (!r || !q) return null;
    const closes = (q.close ?? []).map((c, i) => ({ c, v: q.volume?.[i] })).filter((b) => num(b.c) && num(b.v) !== undefined);
    if (closes.length < 2) return null;
    const today = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    const past = closes.slice(-6, -1).map((b) => b.v);
    const avgVolume = past.length ? past.reduce((a, b) => a + b, 0) / past.length : undefined;
    const m = r.meta ?? {};
    const price = num(m.regularMarketPrice) ?? today.c;
    return {
      symbol,
      name: m.longName ?? m.shortName ?? symbol,
      price,
      changePct: prev.c > 0 ? ((price - prev.c) / prev.c) * 100 : 0,
      volume: today.v,
      avgVolume,
      volumeMultiple: avgVolume && avgVolume > 0 ? today.v / avgVolume : undefined,
      value: today.v * price,
      dayHigh: num(m.regularMarketDayHigh),
      dayLow: num(m.regularMarketDayLow),
      yearHigh: num(m.fiftyTwoWeekHigh),
      yearLow: num(m.fiftyTwoWeekLow),
    };
  } catch {
    return null;
  }
}

async function yahooFallback() {
  const out = [];
  const queue = NIFTY50_FALLBACK.map((s) => s.symbol);
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      for (let s = queue.shift(); s; s = queue.shift()) {
        const row = await yahooVolume(s);
        if (row) out.push(row);
      }
    })
  );
  return out;
}

const num = (v) => {
  const n = typeof v === 'string' ? Number(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

function normalize(row) {
  const symbol = typeof row?.symbol === 'string' ? row.symbol.trim() : undefined;
  // The index's own summary row (e.g. "NIFTY 500") comes back with the constituents: skip it.
  if (!symbol || /\s/.test(symbol) || row?.priority === 1) return null;
  const volume = num(row.totalTradedVolume ?? row.quantityTraded ?? row.volume ?? row.tradedQuantity);
  const price = num(row.lastPrice ?? row.ltp ?? row.lastTradedPrice);
  if (volume === undefined || price === undefined || price <= 0) return null;
  const avgVolume = num(row.week1AvgVolume ?? row.avgVolume);
  return {
    symbol,
    name: row.meta?.companyName ?? row.companyName ?? symbol,
    price,
    changePct: num(row.pChange) ?? 0,
    volume,
    avgVolume,
    // How many times its usual (1-week average) volume has traded today.
    volumeMultiple: avgVolume && avgVolume > 0 ? volume / avgVolume : undefined,
    // Approximate traded value in rupees (shares x last price), same basis for every row.
    value: volume * price,
    dayHigh: num(row.dayHigh),
    dayLow: num(row.dayLow),
    yearHigh: num(row.yearHigh),
    yearLow: num(row.yearLow),
  };
}

const rowsOf = (settled) =>
  settled.status === 'fulfilled' ? settled.value.map(normalize).filter(Boolean) : [];

export async function fetchVolumeLeaders() {
  const [total, active, gainers] = await Promise.allSettled([
    retry(() => fetchNseIndexConstituents('NIFTY TOTAL MARKET')),
    retry(fetchNseMostActiveByVolume),
    retry(fetchNseVolumeGainers),
  ]);

  let universe = rowsOf(total);
  if (universe.length === 0) {
    // Total-market table unavailable: the 500-stock index is the next widest list.
    // If NSE gave us nothing at all, start the Yahoo fallback alongside it so the two overlap.
    const nothingYet = rowsOf(active).length === 0 && rowsOf(gainers).length === 0;
    const [n500, yahoo] = await Promise.allSettled([
      fetchNseIndexConstituents('NIFTY 500'),
      nothingYet ? yahooFallback() : Promise.resolve([]),
    ]);
    if (n500.status === 'fulfilled') universe = n500.value.map(normalize).filter(Boolean);
    if (universe.length === 0 && yahoo.status === 'fulfilled') universe = yahoo.value;
  }

  const bySymbol = new Map();
  for (const r of universe) bySymbol.set(r.symbol, r);
  // Heavy-traded names missing from the index list are added; for names already there, only fill gaps.
  for (const r of [...rowsOf(active), ...rowsOf(gainers)]) {
    const have = bySymbol.get(r.symbol);
    if (!have) {
      bySymbol.set(r.symbol, r);
    } else if (have.avgVolume === undefined && r.avgVolume !== undefined) {
      have.avgVolume = r.avgVolume;
      have.volumeMultiple = r.avgVolume > 0 ? have.volume / r.avgVolume : undefined;
    }
  }

  const rows = [...bySymbol.values()];
  if (rows.length === 0) {
    return lastGood && Date.now() - lastGood.at < STALE_OK_MS ? lastGood.rows : null;
  }
  rows.sort((a, b) => b.volume - a.volume);
  // Don't let a thin fallback result (Nifty 50 only) replace a full market list we already have.
  if (!lastGood || rows.length >= lastGood.rows.length || Date.now() - lastGood.at > STALE_OK_MS) {
    lastGood = { at: Date.now(), rows };
  }
  return rows;
}
