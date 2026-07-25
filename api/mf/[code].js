// Production replacement for the vite dev-server proxy at /api/mf/:code — see
// api/mf/search.js for why this is needed on Vercel.
export default async function handler(req, res) {
  const code = String(req.query.code ?? '');
  if (!code.trim()) {
    res.status(400).json({ error: 'Missing scheme code' });
    return;
  }

  try {
    const upstream = await fetch(`https://api.mfapi.in/mf/${encodeURIComponent(code)}`);
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
