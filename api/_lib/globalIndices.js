// Global index table (name, last, change, high, low, open, previous close)
// for the globe panel in the top bar. Shared by the Vercel function
// (api/market/global-indices.js) and the Vite dev middleware.
//
// To change which indices are shown, edit this list — `symbol` is the
// Yahoo Finance ticker, `region` is the short code shown beside the name.
import { fetch } from './fetchTimeout.js';
export const GLOBAL_INDICES = [
  { key: 'dow', name: 'Dow', region: 'US', symbol: '^DJI' },
  { key: 'dowfut', name: 'Dow Futures', region: 'US', symbol: 'YM=F' },
  { key: 'sp', name: 'S&P', region: 'US', symbol: '^GSPC' },
  { key: 'nikkei', name: 'NIKKEI', region: 'JP', symbol: '^N225' },
  { key: 'hangseng', name: 'HANG SENG', region: 'HK', symbol: '^HSI' },
  { key: 'dax', name: 'DAX', region: 'DE', symbol: '^GDAXI' },
  { key: 'cac', name: 'CAC', region: 'FR', symbol: '^FCHI' },
  { key: 'kospi', name: 'KOSPI', region: 'KR', symbol: '^KS11' },
  { key: 'ftse', name: 'FTSE 100', region: 'GB', symbol: '^FTSE' },
];

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

async function fetchOne({ key, name, region, symbol }) {
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
      key,
      name,
      region,
      price,
      previousClose: num(meta?.chartPreviousClose) ?? num(meta?.previousClose),
      high: num(meta?.regularMarketDayHigh),
      low: num(meta?.regularMarketDayLow),
      open: opens.find((v) => num(v) !== undefined),
      // When this quote was last traded (epoch ms) — shown under the name.
      updatedAt: num(meta?.regularMarketTime) !== undefined ? meta.regularMarketTime * 1000 : undefined,
    };
  } catch {
    return null;
  }
}

/** Rows that could be fetched, in list order (a failed index is left out). */
export async function fetchGlobalIndices() {
  const rows = await Promise.all(GLOBAL_INDICES.map(fetchOne));
  const out = rows.filter(Boolean);
  return out.length ? out : null;
}
