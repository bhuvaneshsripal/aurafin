// Live 24K gold price per gram (INR), best-effort from two free, keyless
// sources: gold-api.com for the XAU/USD spot price, and frankfurter.dev for
// the USD -> INR FX rate.
//
// IMPORTANT — this is a GLOBAL SPOT estimate, not an exact local jeweller
// quote. Indian retail gold prices (e.g. what a city jeweller or an app
// like "Aura Gold" shows) run higher than raw spot because of import duty,
// GST, and dealer margin — there's no free, keyless API for city-level
// retail rates. Settings > Preferences has a "Gold rate adjustment %" so
// the person can calibrate this toward whatever source they trust.
const TROY_OZ_IN_GRAMS = 31.1034768;

// gold-api.com's exact response field isn't publicly documented, so try the
// field names other free/low-cost gold price APIs commonly use.
function extractGoldSpotUsd(json) {
  const candidates = [json?.price, json?.rate, json?.price_usd, json?.rates?.XAU, json?.data?.price];
  for (const c of candidates) {
    if (typeof c === 'number' && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

async function fetchGoldSpotUsdPerOz() {
  const res = await fetch('https://api.gold-api.com/price/XAU');
  if (!res.ok) return null;
  return extractGoldSpotUsd(await res.json());
}

async function fetchUsdInrRate() {
  const res = await fetch('https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR');
  if (!res.ok) return null;
  const json = await res.json();
  const rate = json?.rates?.INR;
  return typeof rate === 'number' && Number.isFinite(rate) ? rate : null;
}

export default async function handler(req, res) {
  try {
    const [usdPerOz, usdInr] = await Promise.all([fetchGoldSpotUsdPerOz(), fetchUsdInrRate()]);

    if (!usdPerOz || !usdInr) {
      res.status(502).json({ error: 'Could not fetch a live gold price right now' });
      return;
    }

    const pricePerGram24k = (usdPerOz / TROY_OZ_IN_GRAMS) * usdInr;

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
    res.status(200).json({
      pricePerGram24k,
      currency: 'INR',
      basis: 'global-spot-estimate',
      asOf: Date.now(),
    });
  } catch {
    res.status(502).json({ error: 'Could not fetch a live gold price right now' });
  }
}
