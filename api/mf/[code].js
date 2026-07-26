// Production replacement for the vite dev-server proxy at /api/mf/:code — see
// api/mf/search.js for why this is needed on Vercel.
export default async function handler(req, res) {
  const code = String(req.query.code ?? '');
  if (!code.trim()) {
    res.status(400).json({ error: 'Missing scheme code' });
    return;
  }

  // mfapi.in supports narrowing the NAV history to a date range. Without
  // this, every request pulls a fund's ENTIRE history since inception —
  // for an old fund (20+ years of daily NAVs) that's a large, slow payload
  // that can time out even though the fund itself is perfectly fine. Callers
  // only ever need history from their SIP's start date onward.
  const params = new URLSearchParams();
  if (typeof req.query.startDate === 'string' && req.query.startDate) {
    params.set('startDate', req.query.startDate);
  }
  if (typeof req.query.endDate === 'string' && req.query.endDate) {
    params.set('endDate', req.query.endDate);
  }
  const qs = params.toString();

  try {
    const upstream = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}${qs ? `?${qs}` : ''}`);
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'mfapi.in returned an error' });
      return;
    }
    const data = await upstream.json();
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.status(200).json(data);
  } catch {
    res.status(502).json({ error: 'Could not reach mfapi.in' });
  }
}
