// Global index table (name, last, change, high, low, open, previous close)
// for the globe panel in the top bar. Shared by the Vercel function
// (api/market/global-indices.js) and the Vite dev middleware.
//
// To change which indices are shown, edit this list — `symbol` is the
// Yahoo Finance ticker, `region` is the short code shown beside the name.
export const GLOBAL_INDICES = [
  { key: 'gspc', name: 'S&P 500', region: 'US', symbol: '^GSPC' },
  { key: 'dji', name: 'Dow Jones', region: 'US', symbol: '^DJI' },
  { key: 'ixic', name: 'Nasdaq Composite', region: 'US', symbol: '^IXIC' },
  { key: 'ftse', name: 'FTSE 100', region: 'UK', symbol: '^FTSE' },
  { key: 'gdaxi', name: 'DAX', region: 'DE', symbol: '^GDAXI' },
  { key: 'fchi', name: 'CAC 40', region: 'FR', symbol: '^FCHI' },
  { key: 'n225', name: 'Nikkei 225', region: 'JP', symbol: '^N225' },
  { key: 'hsi', name: 'Hang Seng', region: 'HK', symbol: '^HSI' },
  { key: 'sse', name: 'Shanghai Composite', region: 'CN', symbol: '000001.SS' },
  { key: 'ks11', name: 'KOSPI', region: 'KR', symbol: '^KS11' },
  { key: 'axjo', name: 'S&P/ASX 200', region: 'AU', symbol: '^AXJO' },
  { key: 'sti', name: 'Straits Times', region: 'SG', symbol: '^STI' },
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
