import { fetchIndianIndices } from '../_lib/indianIndices.js';

export default async function handler(req, res) {
  try {
    const indices = await fetchIndianIndices();
    if (!indices) {
      res.status(502).json({ error: 'Could not fetch Indian indices' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=3, stale-while-revalidate=10');
    res.status(200).json({ indices, asOf: Date.now() });
  } catch {
    res.status(502).json({ error: 'Could not reach the index data source' });
  }
}
