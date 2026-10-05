// Live equity price endpoint. All routing logic (NSE / BSE / Yahoo / US)
// lives in api/_lib/quote.js, shared with the Vite dev middleware.
import { resolveQuote } from '../../_lib/quote.js';

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }
  const market = String(req.query.market ?? 'IN').trim().toUpperCase() === 'US' ? 'US' : 'IN';

  try {
    const quote = await resolveQuote(symbol, market);
    if (!quote) {
      res.status(502).json({ error: `Could not get a live price for ${symbol}` });
      return;
    }
    // 1s edge cache: every viewer polling each second shares one upstream
    // call per symbol instead of hammering NSE/BSE/Yahoo.
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=2');
    res.status(200).json({
      symbol: symbol.replace(/\.(NS|BO)$/i, ''),
      price: quote.price,
      previousClose: quote.previousClose,
      currency: quote.currency,
      source: quote.source,
    });
  } catch {
    res.status(502).json({ error: 'Could not reach the live price source' });
  }
}
