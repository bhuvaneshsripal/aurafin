// Fundamentals for the X/2 · X/3 valuation page. See api/_lib/fundamentals.js.
import { fetchFundamentals } from '../_lib/fundamentals.js';

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim();
  if (!symbol) { res.status(400).json({ error: 'Missing symbol' }); return; }
  const exchange = String(req.query.exchange ?? 'NSE').toUpperCase() === 'BSE' ? 'BSE' : 'NSE';
  try {
    const data = await fetchFundamentals(symbol, exchange, 10);
    if (!data) { res.status(404).json({ error: `No fundamentals found for ${symbol}` }); return; }
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach the fundamentals source' });
  }
}
