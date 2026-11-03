// Company sector lookup, served by api/market/valuation.js as
//   GET /api/market/valuation?mode=sector&symbols=TCS,INFY&market=IN
//   -> { "TCS": { "sector": "Technology", "industry": "Information Technology Services" }, "XYZ": null }
// (Kept inside valuation.js's route on purpose: Vercel's Hobby plan allows at most 12 serverless functions.)
// Company sector + industry from Yahoo Finance (assetProfile). A symbol Yahoo
// has no profile for comes back as null — the app then shows it as
// "Unclassified" rather than guessing.
import { getSession } from './fundamentals.js';
import { fetch } from './fetchTimeout.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_SYMBOLS = 25;

async function profileFor(yahooSymbol, retry = true) {
  const s = await getSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile,price,summaryDetail,defaultKeyStatistics&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: s.cookie } });
  if ((res.status === 401 || res.status === 403) && retry) {
    await getSession(true);
    return profileFor(yahooSymbol, false);
  }
  if (!res.ok) return null;
  const result = (await res.json())?.quoteSummary?.result?.[0];
  const p = result?.assetProfile;
  // Market value of the whole company (Yahoo gives it in the share's own currency).
  // Yahoo leaves price.marketCap empty for some listings: fall back to the
  // summary figure, then to shares outstanding x last price.
  const ok = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
  const shares = result?.defaultKeyStatistics?.sharesOutstanding?.raw ?? result?.defaultKeyStatistics?.impliedSharesOutstanding?.raw;
  const last = result?.price?.regularMarketPrice?.raw;
  const cap = [result?.price?.marketCap?.raw, result?.summaryDetail?.marketCap?.raw, ok(shares) && ok(last) ? shares * last : null].find(ok);
  const marketCap = ok(cap) ? cap : null;
  if ((!p || (!p.sector && !p.industry)) && marketCap === null) return null;
  return {
    sector: p?.sector ?? null,
    industry: p?.industry ?? null,
    marketCap,
    capCurrency: result?.price?.currency ?? null,
  };
}

async function lookup(raw, market) {
  const base = raw.replace(/\.(NS|BO)$/i, '');
  const candidates = market === 'US' ? [base] : /\.BO$/i.test(raw) ? [raw, `${base}.NS`] : [`${base}.NS`, `${base}.BO`];
  for (const c of candidates) {
    const p = await profileFor(c).catch(() => null);
    if (p) return p;
  }
  return null;
}


/** Parse + validate the query and return { symbol: {sector, industry} | null }. */
export async function fetchSectors(rawSymbols, rawMarket) {
  const market = String(rawMarket ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  const symbols = [...new Set(String(rawSymbols ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
    // Tickers are short and made of letters, digits and a few separators;
    // anything else can't be a real symbol and must never reach upstream URLs.
    .filter((s) => /^[A-Za-z0-9&_.-]{1,24}$/.test(s))
    .slice(0, MAX_SYMBOLS);
  if (symbols.length === 0) return null;
  const out = {};
  for (let i = 0; i < symbols.length; i += 5) {
    const chunk = symbols.slice(i, i + 5);
    const results = await Promise.all(chunk.map((s) => lookup(s, market).catch(() => null)));
    chunk.forEach((s, j) => { out[s] = results[j]; });
  }
  return out;
}
