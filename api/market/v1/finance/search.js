// Production replacement for the vite dev-server proxy at /api/market — see
// api/mf/search.js for why this is needed on Vercel (the vite proxy in
// vite.config.ts only runs under `vite dev` / `vite preview`, never in prod).
//
// Used to resolve a real NSE/BSE trading symbol from an ISIN or company
// name, for import sources (e.g. Groww) that don't give a ticker directly.
export default async function handler(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(200).json({ quotes: [] });
    return;
  }

  try {
    const upstream = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=5&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Yahoo Finance returned an error' });
      return;
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach Yahoo Finance' });
  }
}
