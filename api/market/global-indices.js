import { fetchGlobalIndices } from '../_lib/globalIndices.js';

export default async function handler(req, res) {
  try {
    const indices = await fetchGlobalIndices();
    if (!indices) {
      res.status(502).json({ error: 'Could not fetch global indices' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
    res.status(200).json({ indices, asOf: Date.now() });
  } catch {
    res.status(502).json({ error: 'Could not reach the index data source' });
  }
}
