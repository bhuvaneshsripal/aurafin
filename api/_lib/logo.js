// Company logo resolver. Finds the company's official website from Yahoo
// Finance (assetProfile), then fetches the logo image published for that
// domain. Returns { contentType, buffer } or null — never an invented logo.
import { getSession } from './fundamentals.js';
import { fetchNseIsin } from './nse.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const domainCache = new Map(); // symbol -> domain (successful lookups only)
const isinCache = new Map(); // symbol -> ISIN (successful lookups only)


// ETFs have no company profile or stock-logo entry of their own, so show the
// logo of the fund house (AMC) that issues them. Matched on symbol or name.
const AMC_DOMAINS = [
  [/KOTAK/, 'kotakmf.com'],
  [/HDFC/, 'hdfcfund.com'],
  [/NIPPON|RELIANCE ?(ETF|MF|MUTUAL)|BEES$|^CPSEETF|^NETF|^LIQUIDBEES/, 'mf.nipponindiaim.com'],
  [/ICICI|PRUDENTIAL|^I?PRU|IETF$/, 'icicipruamc.com'],
  [/^SETF|\bSBI\b|^SBI/, 'sbimf.com'],
  [/AXIS/, 'axismf.com'],
  [/^UTI|\bUTI\b/, 'utimf.com'],
  [/MIRAE|^MAM|^MON100|^MONIFTY|^MAFANG|^MAHKTECH|^MAKEJRI/, 'miraeassetmf.co.in'],
  [/MOTILAL|^MOM\d|^MOSMALL|^MOVALUE|^MOREALTY|^MOLOWVOL|^MOM100|^MOMENTUM/, 'motilaloswalmf.com'],
  [/\bDSP\b|^DSP/, 'dspim.com'],
  [/ABSL|BIRLA|SUN ?LIFE/, 'mutualfund.adityabirlacapital.com'],
  [/TATA/, 'tatamutualfund.com'],
  [/\bLIC\b|^LIC/, 'licmf.com'],
  [/INVESCO/, 'invescomutualfund.com'],
  [/QUANTUM/, 'quantumamc.com'],
  [/EDELWEISS|BHARAT ?22|^EBBETF|^EBANKNIFTY|^BHARATBOND/, 'edelweissmf.com'],
  [/ZERODHA|^LIQUIDCASE|^GOLDCASE|^SILVERCASE/, 'zerodhafundhouse.com'],
  [/GROWW/, 'growwmf.com'],
  [/BANDHAN|IDFC/, 'bandhanmf.com'],
  [/FRANKLIN|TEMPLETON/, 'franklintempletonindia.com'],
  [/HSBC/, 'assetmanagement.hsbc.co.in'],
  [/SUNDARAM/, 'sundarammutual.com'],
  [/BAJAJ/, 'bajajamc.com'],
  [/PPFAS|PARAG/, 'amc.ppfas.com'],
  [/CANARA/, 'canararobeco.com'],
  [/MAHINDRA/, 'mahindramanulife.com'],
  [/BARODA|\bBNP\b/, 'barodabnpparibasmf.in'],
  [/UNION/, 'unionmf.com'],
  [/NAVI/, 'navimutualfund.com'],
  [/SAMCO/, 'samcomf.com'],
  [/HELIOS/, 'heliosmf.in'],
  [/WHITE ?OAK/, 'mf.whiteoakindia.com'],
  [/\bPGIM\b|^PGIM/, 'pgimindiamf.com'],
  [/JM FINANCIAL|^JM /, 'jmfinancialmf.com'],
  [/360 ?ONE/, '360.one'],
  [/TAURUS/, 'taurusmutualfund.com'],
  [/TRUST ?MF|TRUSTMF/, 'trustmf.com'],
  [/\bITI\b/, 'itiamc.com'],
  [/SHRIRAM/, 'shriramamc.in'],
];
function amcDomainFor(base, name) {
  const nm = String(name ?? '').toUpperCase();
  const hay = `${base} ${nm}`;
  // The fund's own name is the most reliable clue ("HDFC NIFTY 50 ETF"), then the ticker.
  for (const [re, d] of AMC_DOMAINS) if (re.test(nm)) return d;
  for (const [re, d] of AMC_DOMAINS) if (re.test(base) || re.test(hay)) return d;
  return null;
}

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

async function fetchImage(url, minBytes = 300, headers = {}) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'image/*', ...headers },
      redirect: 'follow',
      signal: AbortSignal.timeout(6000),
    });
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || !type.startsWith('image/')) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    return buffer.length >= minBytes ? { contentType: type, buffer } : null;
  } catch { return null; }
}

// Try every source at once and keep the best-ranked hit (earlier in the list
// wins), so one slow or dead source never delays or blocks the others.
async function firstByPriority(tasks) {
  const results = await Promise.all(tasks.map((t) => t().catch(() => null)));
  return results.find(Boolean) ?? null;
}

// NSE rate-limits and drops its cookie when hit by many parallel requests,
// which is exactly what a long holdings list does (one logo each). Look ISINs
// up at most two at a time, and retry once on a fresh cookie.
let nseActive = 0;
const nseWaiters = [];
async function withNseSlot(fn) {
  if (nseActive >= 2) await new Promise((resolve) => nseWaiters.push(resolve));
  nseActive++;
  try { return await fn(); } finally {
    nseActive--;
    nseWaiters.shift()?.();
  }
}
async function lookupIsin(base) {
  return withNseSlot(async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const isin = await fetchNseIsin(base).catch(() => null);
      if (isin) return isin;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  });
}

export async function resolveLogo(rawSymbol, market = 'IN', knownIsin, trace, name) {
  const raw = String(rawSymbol).trim().toUpperCase();
  const base = raw.replace(/\.(NS|BO)$/i, '');
  const key = `${market}:${raw}`;
  const isBse = /\.BO$/i.test(raw);

  // Only *successful* lookups are remembered. A miss (NSE hiccup, rate limit)
  // must not stick, or that stock would show no logo until the server restarts.
  let isin = /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(String(knownIsin ?? '').toUpperCase()) ? String(knownIsin).toUpperCase() : isinCache.get(key);
  if (market === 'IN' && !isin && !/^\d+$/.test(base)) {
    isin = await lookupIsin(base);
    if (isin) isinCache.set(key, isin);
  }
  trace?.push({ step: 'isin', isin: isin ?? null });

  // 1) Stock-logo CDNs, all tried together; the order below is the priority.
  const direct = [];
  if (market === 'IN') {
    if (isin) {
      const g = { Referer: 'https://groww.in/' };
      direct.push(
        () => fetchImage(`https://assets-netstorage.groww.in/stock-assets/logos/${isin}.png`, 100, g),
        () => fetchImage(`https://assets-netstorage.groww.in/stock-assets/logos2/${isin}.png`, 100, g),
        () => fetchImage(`https://assets.parqet.com/logos/isin/${isin}?format=png`, 100),
      );
    }
    direct.push(
      () => fetchImage(`https://financialmodelingprep.com/image-stock/${base}.${isBse ? 'BO' : 'NS'}.png`),
      () => fetchImage(`https://images.dhan.co/symbol/${base}.png`),
      () => fetchImage(`https://eodhd.com/img/logos/${isBse ? 'BSE' : 'NSE'}/${base}.png`),
    );
  } else {
    direct.push(
      () => fetchImage(`https://assets.parqet.com/logos/symbol/${base}?format=png`, 100),
      () => fetchImage(`https://financialmodelingprep.com/image-stock/${base}.png`),
      () => fetchImage(`https://eodhd.com/img/logos/US/${base}.png`),
    );
  }
  const hit = await firstByPriority(direct);
  trace?.push({ step: 'logo-cdns', found: !!hit });
  if (hit) return hit;

  // 2) Fallback: the logo published for the company's own website. An ETF
  //    has none, so its fund house (Kotak, HDFC, Nippon…) is used instead.
  let domain = domainCache.get(key);
  if (!domain) {
    domain = market === 'IN' ? amcDomainFor(base, name) : null;
    if (!domain) domain = await findDomain(raw, market);
    if (domain) domainCache.set(key, domain);
  }
  trace?.push({ step: 'website', domain: domain ?? null });
  if (!domain) return null;
  return firstByPriority([
    () => fetchImage(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${domain}&size=128`, 200),
    () => fetchImage(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`, 200),
    () => fetchImage(`https://icons.duckduckgo.com/ip3/${domain}.ico`, 200),
    () => fetchImage(`https://favicone.com/${domain}?s=128`, 200),
    () => fetchImage(`https://${domain}/apple-touch-icon.png`, 200),
    () => fetchImage(`https://${domain}/favicon.ico`, 200),
  ]);
}
