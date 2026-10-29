// GET /api/market/logo?symbol=TCS&market=IN  ->  the company's logo image.
import { resolveLogo } from '../_lib/logo.js';

export default async function handler(req, res) {
  const rawSymbol = String(req.query.symbol ?? '').trim();
  const rawName = String(req.query.name ?? '').trim();
  // Tickers are short and made of letters, digits and a few separators; anything
  // else must never be spliced into upstream URLs. Funds/ETFs often arrive as
  // "HDFCAMC - HDFCNIFTY" or a bare name, so the last clean token is used as the
  // ticker and the full name still drives the fund-house (AMC) match.
  const tokens = (s) => s.split(/[^A-Za-z0-9&_.]+/).filter((t) => /^[A-Za-z0-9&_.-]{1,24}$/.test(t));
  const valid = /^[A-Za-z0-9&_.-]{1,24}$/.test(rawSymbol);
  const symbol = valid ? rawSymbol : (tokens(rawSymbol).pop() ?? tokens(rawName)[0] ?? '');
  if (!symbol) { res.status(400).end(); return; }
  const market = String(req.query.market ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  if (req.query.debug) {
    const trace = [];
    const logo = await resolveLogo(symbol, market, String(req.query.isin ?? ''), trace, String(req.query.name ?? '')).catch((e) => { trace.push({ error: String(e) }); return null; });
    res.status(200).json({ symbol, market, foundLogo: !!logo, trace });
    return;
  }
  try {
    const logo = await resolveLogo(symbol, market, String(req.query.isin ?? ''), undefined, String(req.query.name ?? ''));
    if (!logo) {
      // Short: a miss is often a transient upstream hiccup, so let it retry soon.
      res.setHeader('Cache-Control', 'no-store');
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
