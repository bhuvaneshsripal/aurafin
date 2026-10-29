import { fetchIndices } from '../_lib/indices.js';
import { fetchGlobalIndices } from '../_lib/globalIndices.js';
import { fetchIndianIndices } from '../_lib/indianIndices.js';

// One function serves all three index feeds so the project stays within Vercel Hobby's
// 12-function limit. vercel.json rewrites keep the old URLs working:
//   /api/market/indices         -> top-bar Nifty 50 / Sensex / Bank Nifty
//   /api/market/global-indices  -> /api/market/indices?mode=global
//   /api/market/indian-indices  -> /api/market/indices?mode=indian
export default async function handler(req, res) {
  const mode = String(req.query.mode ?? '');
  try {
    if (mode === 'global') {
      const indices = await fetchGlobalIndices();
      if (!indices) { res.status(502).json({ error: 'Could not fetch global indices' }); return; }
      res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      res.status(200).json({ indices, asOf: Date.now() });
      return;
    }
    if (mode === 'indian') {
      const indices = await fetchIndianIndices();
      if (!indices) { res.status(502).json({ error: 'Could not fetch Indian indices' }); return; }
      res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=2');
      res.status(200).json({ indices, asOf: Date.now() });
      return;
    }
    const indices = await fetchIndices();
    if (!indices) { res.status(502).json({ error: 'Could not fetch index levels' }); return; }
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.status(200).json({ indices });
  } catch {
    res.status(502).json({ error: 'Could not reach the index data source' });
  }
}
