// Company logo resolver. Finds the company's official website from Yahoo
// Finance (assetProfile), then fetches the logo image published for that
// domain. Returns { contentType, buffer } or null — the UI falls back to an
// initials badge when null, so no logo is ever invented or substituted.
import { getSession } from './fundamentals.js';
import { fetchNseIsin } from './nse.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const domainCache = new Map(); // symbol -> domain | null (warm-instance cache)
const isinCache = new Map(); // symbol -> ISIN | null

async function websiteFor(yahooSymbol, retry = true) {
  const s = await getSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(yahooSymbol)}?modules=assetProfile&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: s.cookie } });
  if ((res.status === 401 || res.status === 403) && retry) { await getSession(true); return websiteFor(yahooSymbol, false); }
  if (!res.ok) return null;
  const site = (await res.json())?.quoteSummary?.result?.[0]?.assetProfile?.website;
  if (!site) return null;
  try { return new URL(/^https?:/i.test(site) ? site : `https://${site}`).hostname.replace(/^www\./, ''); } catch { return null; }
}

async function findDomain(raw, market) {
  const base = raw.replace(/\.(NS|BO)$/i, '');
  const candidates = market === 'US' ? [base] : /\.BO$/i.test(raw) ? [raw, `${base}.NS`] : [`${base}.NS`, `${base}.BO`];
  for (const c of candidates) {
    const d = await websiteFor(c).catch(() => null);
    if (d) return d;
  }
  return null;
}

async function fetchImage(url, minBytes) {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.startsWith('image/')) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    return buffer.length >= minBytes ? { contentType: type, buffer } : null;
  } catch { return null; }
}

// Groww publishes its stock logos by ISIN.
async function fetchGrowwLogo(isin) {
  const headers = { 'User-Agent': UA, Referer: 'https://groww.in/', Accept: 'image/*' };
  for (const url of [
    `https://assets-netstorage.groww.in/stock-assets/logos/${isin}.png`,
    `https://assets-netstorage.groww.in/stock-assets/logos2/${isin}.png`,
    `https://assets.parqet.com/logos/isin/${isin}?format=png`,
  ]) {
    try {
      const r = await fetch(url, { headers });
      const type = r.headers.get('content-type') ?? '';
      if (!r.ok || !type.startsWith('image/')) continue;
      const buffer = Buffer.from(await r.arrayBuffer());
      if (buffer.length > 100) return { contentType: type, buffer };
    } catch { /* try next */ }
  }
  return null;
}

export async function resolveLogo(rawSymbol, market = 'IN', knownIsin, trace) {
  const raw = String(rawSymbol).trim().toUpperCase();
  const key = `${market}:${raw}`;

  // 1) Groww logo (Indian stocks), by ISIN — from the holding if known, else NSE.
  if (market === 'IN') {
    let isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(knownIsin ?? '').toUpperCase()) ? String(knownIsin).toUpperCase() : isinCache.get(key);
    if (isin === undefined && !/^\d+(\.BO)?$/.test(raw)) {
      isin = await fetchNseIsin(raw.replace(/\.(NS|BO)$/i, '')).catch(() => null);
      isinCache.set(key, isin);
    }
    trace?.push({ step: 'isin', isin: isin ?? null });
    if (isin) {
      const g = await fetchGrowwLogo(isin);
      trace?.push({ step: 'groww/parqet', found: !!g });
      if (g) return g;
    }
  }

  // 2) Fallback: the logo published for the company's own website.
  let domain = domainCache.get(key);
  if (domain === undefined) {
    domain = await findDomain(raw, market);
    domainCache.set(key, domain);
  }
  trace?.push({ step: 'website', domain: domain ?? null });
  if (!domain) return null;
  return (
    (await fetchImage(`https://logo.clearbit.com/${domain}?size=128`, 200)) ||
    (await fetchImage(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`, 300)) ||
    null
  );
}
