// Live equity price endpoint. Tries NSE India's own API first (more
// reliable for NSE-listed stocks, no API key needed), and falls back
// to Yahoo Finance's chart endpoint if NSE fails (rate-limited,
// blocked, or the symbol isn't NSE-listed, e.g. BSE-only tickers).
//
// Response shape is normalized to { symbol, price, currency, source }
// regardless of which upstream answered, so the frontend never needs
// to know which one it was.
import { fetchNseQuote } from '../../_lib/nse.js';

// US tickers (AAPL, TSLA, GOOGL, ...) are used as-is on Yahoo — no
// exchange suffix needed, unlike NSE/BSE symbols which need .NS/.BO.
async function fetchYahooFallback(rawSymbol, market) {
  const yahooSymbol =
    market === 'US'
      ? rawSymbol
      : /\.(NS|BO)$/i.test(rawSymbol)
        ? rawSymbol
        : `${rawSymbol}.NS`;
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`,
    { headers: { 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!upstream.ok) return null;
  const data = await upstream.json();
  const meta = data?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice ?? meta?.previousClose;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  const previousClose = meta?.previousClose ?? meta?.chartPreviousClose;
  return {
    price,
    currency: meta?.currency ?? (market === 'US' ? 'USD' : 'INR'),
    previousClose: typeof previousClose === 'number' && Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  // 'IN' (default) = NSE, falling back to BSE/Yahoo. 'US' = skip NSE
  // entirely and go straight to the US market via Yahoo, since a US
  // ticker like AAPL isn't an NSE symbol and would just fail there (or
  // worse, coincidentally collide with an unrelated NSE symbol).
  const market = String(req.query.market ?? 'IN').trim().toUpperCase() === 'US' ? 'US' : 'IN';

  // Symbol may arrive with a Yahoo-style suffix (.NS/.BO) from older
  // cached data — NSE's API wants the bare symbol.
  const bareSymbol = symbol.replace(/\.(NS|BO)$/i, '');

  if (market === 'IN') {
    try {
      const quote = await fetchNseQuote(bareSymbol);
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.status(200).json({
        symbol: bareSymbol,
        price: quote.price,
        previousClose: quote.previousClose,
        currency: quote.currency,
        source: 'nse',
      });
      return;
    } catch {
      // fall through to Yahoo below
    }
  }

  try {
    const quote = await fetchYahooFallback(symbol, market);
    if (!quote) {
      res
        .status(502)
        .json({ error: `Could not get a live price from ${market === 'US' ? 'the US market' : 'NSE or Yahoo'}` });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({
      symbol: bareSymbol,
      price: quote.price,
      previousClose: quote.previousClose,
      currency: quote.currency,
      source: 'yahoo',
    });
  } catch {
    res.status(502).json({ error: 'Could not reach the live price source' });
  }
}
