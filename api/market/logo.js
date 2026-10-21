// GET /api/market/logo?symbol=TCS&market=IN  ->  the company's logo image.
import { resolveLogo } from '../_lib/logo.js';

export default async function handler(req, res) {
  const symbol = String(req.query.symbol ?? '').trim();
  if (!symbol) { res.status(400).end(); return; }
  const market = String(req.query.market ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  if (req.query.debug) {
    const trace = [];
    const logo = await resolveLogo(symbol, market, String(req.query.isin ?? ''), trace).catch((e) => { trace.push({ error: String(e) }); return null; });
    res.status(200).json({ symbol, market, foundLogo: !!logo, trace });
    return;
  }
  try {
    const logo = await resolveLogo(symbol, market, String(req.query.isin ?? ''));
    if (!logo) {
      res.setHeader('Cache-Control', 's-maxage=86400');
      res.status(404).end();
      return;
    }
    res.setHeader('Content-Type', logo.contentType);
    res.setHeader('Cache-Control', 'public, max-age=2592000, s-maxage=2592000, immutable');
    res.status(200).send(logo.buffer);
  } catch {
    res.status(502).end();
  }
}
