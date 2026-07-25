// Production replacement for the vite dev-server proxy at /api/mf (see vite.config.ts).
// The vite proxy only runs under `vite dev` / `vite preview` — on Vercel there is no
// dev server, so without this function every request fell through to vercel.json's
// SPA catch-all rewrite and got back index.html instead of JSON, which is what the
// "Couldn't reach the fund search" error was actually seeing.
export default async function handler(req, res) {
  const q = typeof req.query.q === 'string' ? req.query.q : '';
  if (!q.trim()) {
    res.status(200).json([]);
    return;
  }

  try {
    const upstream = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`);
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
