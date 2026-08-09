// Live currency-exchange-rate endpoint, backed by frankfurter.dev (free,
// keyless, same source already used for the USD -> INR leg of the gold
// price). Powers the "invest ₹100 in a $354 stock" flow: converting an
// amount typed in one currency into the asset's own currency so a
// fractional quantity can be computed from it.
export default async function handler(req, res) {
  const from = String(req.query.from ?? 'USD').trim().toUpperCase();
  const to = String(req.query.to ?? 'INR').trim().toUpperCase();

  if (from === to) {
    res.status(200).json({ rate: 1, from, to, asOf: Date.now() });
    return;
  }

  try {
    const upstream = await fetch(
      `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`
    );
    if (!upstream.ok) {
      res.status(502).json({ error: 'Could not fetch a live exchange rate' });
      return;
    }
    const json = await upstream.json();
    const rate = json?.rates?.[to];
    if (typeof rate !== 'number' || !Number.isFinite(rate)) {
      res.status(502).json({ error: 'Exchange rate not available for this currency pair' });
      return;
    }
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=1800');
    res.status(200).json({ rate, from, to, asOf: Date.now() });
  } catch {
    res.status(502).json({ error: 'Could not reach the exchange rate source' });
  }
}
