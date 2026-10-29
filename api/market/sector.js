// GET /api/market/sector?symbols=TCS,INFY&market=IN
//   -> { "TCS": { "sector": "Technology", "industry": "Information Technology Services" }, "XYZ": null }
// Company sector + industry from Yahoo Finance (assetProfile). A symbol Yahoo
// has no profile for comes back as null — the app then shows it as
// "Unclassified" rather than guessing.
import { getSession } from '../_lib/fundamentals.js';
import { fetch } from '../_lib/fetchTimeout.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const MAX_SYMBOLS = 25;

async function profileFor(yahooSymbol, retry = true) {
  const s = await getSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: s.cookie } });
  if ((res.status === 401 || res.status === 403) && retry) {
    await getSession(true);
    return profileFor(yahooSymbol, false);
  }
  if (!res.ok) return null;
  const p = (await res.json())?.quoteSummary?.result?.[0]?.assetProfile;
  if (!p || (!p.sector && !p.industry)) return null;
  return { sector: p.sector ?? null, industry: p.industry ?? null };
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

export default async function handler(req, res) {
  const market = String(req.query.market ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  const symbols = [...new Set(String(req.query.symbols ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
    // Tickers are short and made of letters, digits and a few separators;
    // anything else can't be a real symbol and must never reach upstream URLs.
    .filter((s) => /^[A-Za-z0-9&_.-]{1,24}$/.test(s))
    .slice(0, MAX_SYMBOLS);
  if (symbols.length === 0) { res.status(400).json({ error: 'Missing symbols' }); return; }

  try {
    const out = {};
    for (let i = 0; i < symbols.length; i += 5) {
      const chunk = symbols.slice(i, i + 5);
      const results = await Promise.all(chunk.map((s) => lookup(s, market).catch(() => null)));
      chunk.forEach((s, j) => { out[s] = results[j]; });
    }
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    res.status(200).json(out);
  } catch {
    res.status(502).json({ error: 'Could not reach the sector source' });
  }
}
