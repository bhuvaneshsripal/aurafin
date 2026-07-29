// Symbol search endpoint, used to resolve a real NSE trading symbol
// from an ISIN or company name (e.g. for Groww imports that give a
// full company name instead of a ticker). Tries NSE's own autocomplete
// first, falls back to Yahoo's symbol search if NSE fails.
import { searchNseSymbol } from '../../../_lib/nse.js';

async function searchYahooFallback(q) {
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  // TEMP DIAGNOSTIC LOGGING — remove once live-price issue is confirmed/fixed.
  console.log(`[DIAG search] yahoo fallback(${q}): status=${upstream.status}`);
  if (!upstream.ok) return null;
  const json = await upstream.json();
  console.log(`[DIAG search] yahoo fallback(${q}): quoteCount=${json?.quotes?.length ?? 'n/a'}`);
  return json;
}

export default async function handler(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(200).json({ quotes: [] });
    return;
  }

  try {
    const result = await searchNseSymbol(q);
    console.log(`[DIAG search] NSE(${q}): quoteCount=${result.quotes.length}`);
    if (result.quotes.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(200).json(result);
      return;
    }
    // NSE handshake worked but found nothing — still worth trying Yahoo
    // in case it's a BSE-only or non-NSE name.
  } catch (err) {
    // NSE handshake/search failed outright — fall through to Yahoo below
    console.log(`[DIAG search] NSE(${q}) threw: ${err instanceof Error ? err.message : err}`);
  }

  try {
    const yahooResult = await searchYahooFallback(q);
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(yahooResult ?? { quotes: [] });
  } catch (err) {
    console.log(`[DIAG search] yahoo fallback(${q}) threw: ${err instanceof Error ? err.message : err}`);
    res.status(502).json({ error: 'Could not reach NSE or Yahoo Finance' });
  }
}
