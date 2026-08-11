// Live 24K gold price per gram (INR) — see api/_lib/gold.js for the
// upstream sources (with fallbacks) and important caveats (this is a
// GLOBAL SPOT estimate, not an exact local jeweller rate).
import { fetchLiveGoldPricePerGram24k } from '../_lib/gold.js';

export default async function handler(req, res) {
  try {
    const result = await fetchLiveGoldPricePerGram24k();
    if (!result) {
      res.status(502).json({ error: 'Could not fetch a live gold price right now' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      pricePerGram24k: result.pricePerGram24k,
      currency: 'INR',
      basis: 'global-spot-estimate',
      asOf: result.asOf,
    });
  } catch {
    res.status(502).json({ error: 'Could not fetch a live gold price right now' });
  }
}
