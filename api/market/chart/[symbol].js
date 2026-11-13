// Live equity price endpoint. All routing logic (NSE / BSE / Yahoo / US)
// lives in api/_lib/quote.js, shared with the Vite dev middleware.
import '../../_lib/quietDeprecations.js';
import { resolveQuote } from '../../_lib/quote.js';
import { parseSymbols, resolveQuotes } from '../../_lib/batchQuotes.js';

// bucket-keyed snapshots, so concurrent requests on one instance share one upstream round
const snapshots = new Map();

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim().toUpperCase();
  if (!symbol) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }
  const market = String(req.query.market ?? 'IN').trim().toUpperCase() === 'US' ? 'US' : 'IN';

  // /api/market/chart/_batch?symbols=TCS,INFY,...  -> every price in ONE request.
  // Handled here (not in its own file) so it doesn't use up another of
  // Vercel's serverless-function slots.
  if (symbol === '_BATCH') {
    const symbols = parseSymbols(req.query.symbols);
    if (symbols.length === 0) {
      res.status(400).json({ error: 'Missing symbols' });
      return;
    }
    try {
      // Same bucket + same symbols => identical answer, whichever device asks.
      const bucket = String(req.query.b ?? '');
      const key = `${market}|${bucket}|${symbols.join(',')}`;
      let snap = bucket ? snapshots.get(key) : undefined;
      if (!snap) {
        snap = resolveQuotes(symbols, market).then((quotes) => ({ quotes, asOf: Date.now() }));
        if (bucket) {
          snapshots.set(key, snap);
          snap.catch(() => snapshots.delete(key));
          if (snapshots.size > 50) snapshots.delete(snapshots.keys().next().value);
        }
      }
      const body = await snap;
      // The CDN keeps this exact response for the whole bucket window (the b= value
      // is in the URL), so every device in that window gets the same numbers.
      res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=0');
      res.status(200).json(body);
    } catch {
      res.status(502).json({ error: 'Could not reach the live price source' });
    }
    return;
  }

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
