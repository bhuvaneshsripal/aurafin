// Production replacement for the vite dev-server proxy at /api/market — see
// api/mf/search.js for why this is needed on Vercel (the vite proxy in
// vite.config.ts only runs under `vite dev` / `vite preview`, never in prod).
export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '');
  if (!symbol.trim()) {
    res.status(400).json({ error: 'Missing symbol' });
    return;
  }

  const { symbol: _symbol, ...rest } = req.query;
  const qs = new URLSearchParams(
    Object.entries(rest).map(([k, v]) => [k, String(Array.isArray(v) ? v[0] : v)])
  ).toString();

  try {
    const upstream = await fetch(
      `https://query1.finance.yahoo.com/chart/${encodeURIComponent(symbol)}${qs ? `?${qs}` : ''}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'Yahoo Finance returned an error' });
      return;
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach Yahoo Finance' });
  }
}
