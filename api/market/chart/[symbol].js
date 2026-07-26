// Live equity price endpoint. Tries NSE India's own API first (more
// reliable for NSE-listed stocks, no API key needed), and falls back
// to Yahoo Finance's chart endpoint if NSE fails (rate-limited,
// blocked, or the symbol isn't NSE-listed, e.g. BSE-only tickers).
//
// Response shape is normalized to { symbol, price, currency, source }
// regardless of which upstream answered, so the frontend never needs
// to know which one it was.
import { fetchNseQuote } from '../../_lib/nse.js';

async function fetchYahooFallback(rawSymbol) {
  // Yahoo needs an exchange suffix; NSE symbols don't have one, so add
  // .NS unless the caller already gave us a suffixed/BSE symbol.
  const yahooSymbol = /\.(NS|BO)$/i.test(rawSymbol) ? rawSymbol : `${rawSymbol}.NS`;
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  return { price, currency: meta?.currency ?? 'INR' };
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  // Symbol may arrive with a Yahoo-style suffix (.NS/.BO) from older
  // cached data — NSE's API wants the bare symbol.
  const bareSymbol = symbol.replace(/\.(NS|BO)$/i, '');

  try {
    const quote = await fetchNseQuote(bareSymbol);
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ symbol: bareSymbol, price: quote.price, currency: quote.currency, source: 'nse' });
    return;
  } catch {
    // fall through to Yahoo below
  }

  try {
    const quote = await fetchYahooFallback(symbol);
    if (!quote) {
      res.status(502).json({ error: 'Could not get a live price from NSE or Yahoo' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ symbol: bareSymbol, price: quote.price, currency: quote.currency, source: 'yahoo' });
  } catch {
    res.status(502).json({ error: 'Could not reach NSE or Yahoo Finance' });
  }
}
