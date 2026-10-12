import { fetchIndices } from '../_lib/indices.js';

// Nifty 50 / Sensex / Bank Nifty for the top-bar ticker.
export default async function handler(req, res) {
  try {
    const indices = await fetchIndices();
    if (!indices) {
      res.status(502).json({ error: 'Could not fetch index levels' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=1, stale-while-revalidate=2');
    res.status(200).json({ indices });
  } catch {
    res.status(502).json({ error: 'Could not reach the index data source' });
  }
}
