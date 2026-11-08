import '../_lib/quietDeprecations.js';
import { fetchIndices } from '../_lib/indices.js';
import { fetchGlobalIndices } from '../_lib/globalIndices.js';
import { fetchIndianIndices } from '../_lib/indianIndices.js';
import { fetchVolumeLeaders } from '../_lib/volumeLeaders.js';
import { runSwingScan } from '../_lib/swingScan.js';

// The swing scan fetches ~200 stocks' history on a cold start.
export const config = { maxDuration: 30 };

// One function serves all three index feeds so the project stays within Vercel Hobby's
// 12-function limit. vercel.json rewrites keep the old URLs working:
//   /api/market/indices         -> top-bar Nifty 50 / Sensex / Bank Nifty
//   /api/market/global-indices  -> /api/market/indices?mode=global
//   /api/market/indian-indices  -> /api/market/indices?mode=indian
//   /api/market/swing           -> /api/market/indices?mode=swing   (swing-trade scanner, Nifty 200)
//   /api/market/volume          -> /api/market/indices?mode=volume  (highest-volume NSE stocks)
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
    if (mode === 'swing') {
      const result = await runSwingScan({
        index: String(req.query.index ?? 'NIFTY 200'),
        offset: Number(req.query.offset ?? 0),
        limit: Number(req.query.limit ?? 60),
      });
      if (!result) { res.status(502).json({ error: 'Could not build the swing scan' }); return; }
      res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=3600');
      res.status(200).json({ ...result, asOf: Date.now() });
      return;
    }
    if (mode === 'volume') {
      const stocks = await fetchVolumeLeaders();
      if (!stocks) { res.status(502).json({ error: 'Could not fetch volume data' }); return; }
      res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
      res.status(200).json({ stocks, asOf: Date.now() });
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
