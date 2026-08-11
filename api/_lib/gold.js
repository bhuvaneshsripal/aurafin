// Shared logic for the live 24K gold price (per gram, INR) — used by both
// the real Vercel function (api/market/gold.js) and the local-dev stand-in
// (marketApiDevMiddleware in vite.config.ts), so the two never drift apart.
//
// Best-effort from a small chain of free, keyless sources — tried in
// order, falling back to the next if one is unreachable (some networks/
// ISPs block one host but not another).
//
// Spot price (XAU/USD): gold-api.com, falling back to Yahoo Finance's
// COMEX gold futures chart (GC=F) — the same Yahoo endpoint this app
// already relies on elsewhere for stock/ETF live prices, so if that
// works for you, this fallback will too.
//
// FX (USD -> INR): frankfurter.dev, falling back to Yahoo Finance's
// USD/INR chart (INR=X).
export const TROY_OZ_IN_GRAMS = 31.1034768;

const YAHOO_HEADERS = { 'User-Agent': 'Mozilla/5.0' };

async function fetchYahooChartPrice(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
    { headers: YAHOO_HEADERS }
  );
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  return typeof price === 'number' && Number.isFinite(price) && price > 0 ? price : null;
}

// gold-api.com's exact response field isn't publicly documented, so try the
// field names other free/low-cost gold price APIs commonly use.
function extractGoldSpotUsd(json) {
  const candidates = [json?.price, json?.rate, json?.price_usd, json?.rates?.XAU, json?.data?.price];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

export async function fetchGoldSpotUsdPerOz() {
  try {
    const res = await fetch('https://api.gold-api.com/price/XAU');
    if (res.ok) {
      const price = extractGoldSpotUsd(await res.json());
      if (price) return price;
    }
  } catch {
    // fall through to Yahoo
  }
  try {
    return await fetchYahooChartPrice('GC=F');
  } catch {
    return null;
  }
}

export async function fetchUsdInrRate() {
  try {
    const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
    if (res.ok) {
      const json = await res.json();
      const rate = json?.rates?.INR;
      if (typeof rate === 'number' && Number.isFinite(rate)) return rate;
    }
  } catch {
    // fall through to Yahoo
  }
  try {
    return await fetchYahooChartPrice('INR=X');
  } catch {
    return null;
  }
}

/** Returns { pricePerGram24k, asOf } or null if every source failed. */
export async function fetchLiveGoldPricePerGram24k() {
  const [usdPerOz, usdInr] = await Promise.all([fetchGoldSpotUsdPerOz(), fetchUsdInrRate()]);
  if (!usdPerOz || !usdInr) return null;
  return { pricePerGram24k: (usdPerOz / TROY_OZ_IN_GRAMS) * usdInr, asOf: Date.now() };
}
