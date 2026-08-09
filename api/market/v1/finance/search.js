// Symbol search endpoint, used both to resolve a real trading symbol
// from an ISIN or company name (e.g. for Groww imports that give a
// full company name instead of a ticker) and to power the "type 3
// letters, pick from a list" autocomplete on the Add Asset form.
//
// For the Indian market: tries NSE's own autocomplete first (more
// reliable, no name field but a clean symbol list), falls back to
// Yahoo's symbol search if NSE fails or finds nothing.
//
// For the US market: NSE has no US listings at all, so we skip it
// entirely and go straight to Yahoo, which is what actually knows
// "Google" -> GOOGL/GOOG.
import { searchNseSymbol } from '../../../_lib/nse.js';

// Exchanges Yahoo tags US-listed equities/ETFs with. Filters out
// incidental non-US matches (e.g. a cross-listed ADR on another
// exchange) so the US suggestion list stays US-only.
const US_EXCHANGES = new Set(['NMS', 'NYQ', 'NGM', 'NCM', 'ASE', 'PCX', 'BTS', 'PNK']);

async function searchYahoo(q) {
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const quotes = Array.isArray(data?.quotes) ? data.quotes : [];
  return quotes.map((q) => ({
    symbol: q.symbol,
    name: q.shortname ?? q.longname ?? q.symbol,
    exchDisp: q.exchDisp,
    exchange: q.exchange,
    quoteType: q.quoteType,
  }));
}

export default async function handler(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  const market = String(req.query.market ?? 'IN').trim().toUpperCase() === 'US' ? 'US' : 'IN';
  if (!q.trim()) {
    res.status(200).json({ quotes: [] });
    return;
  }

  if (market === 'US') {
    try {
      const quotes = (await searchYahoo(q)) ?? [];
      const filtered = quotes.filter(
        (r) =>
          r.symbol &&
          (r.quoteType === 'EQUITY' || r.quoteType === 'ETF') &&
          (!r.exchange || US_EXCHANGES.has(r.exchange))
      );
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      res.status(200).json({ quotes: filtered });
    } catch {
      res.status(502).json({ error: 'Could not reach Yahoo Finance' });
    }
    return;
  }

  try {
    const result = await searchNseSymbol(q);
    if (result.quotes.length > 0) {
      res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
      // NSE's autocomplete gives us a symbol but no company name.
      res.status(200).json({ quotes: result.quotes.map((r) => ({ ...r, name: r.symbol })) });
      return;
    }
    // NSE handshake worked but found nothing — still worth trying Yahoo
    // in case it's a BSE-only or non-NSE name.
  } catch {
    // NSE handshake/search failed outright — fall through to Yahoo below
  }

  try {
    const quotes = (await searchYahoo(q)) ?? [];
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json({ quotes });
  } catch {
    res.status(502).json({ error: 'Could not reach NSE or Yahoo Finance' });
  }
}
