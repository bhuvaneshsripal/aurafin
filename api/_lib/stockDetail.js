// Everything the full-page stock view (src/pages/StockQuote.tsx) needs, served by
// api/market/valuation.js as
//   GET /api/market/valuation?mode=history&symbol=BRITANNIA&market=IN&exchange=NSE&range=1D
//     -> price points for the chart (OHLC + volume)
//   GET /api/market/valuation?mode=detail&symbol=BRITANNIA&market=IN&exchange=NSE
//     -> performance, fundamentals, quarterly/yearly financials, shareholding, about
// (Kept inside valuation.js's route on purpose: Vercel's Hobby plan allows at most 12 serverless functions.)
//
// Sources: Yahoo Finance (chart, quoteSummary, fundamentals-timeseries) and NSE India
// (quote-equity for circuits / industry P/E / face value, corporate-share-holdings-master
// for the promoter / public holding). Nothing is invented: any field a source does not
// return is null and the page leaves that row out or shows "—".
import { fetch } from './fetchTimeout.js';
import { getSession } from './fundamentals.js';
import { fetchNseJson, fetchNseText } from './nse.js';
import { applyOverrides, peerGroupFor } from './stockOverrides.js';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/** Chart ranges -> how much history and how fine the candles are. */
export const RANGES = {
  '1D': { range: '1d', interval: '1m' },
  '1W': { range: '5d', interval: '5m' },
  '1M': { range: '1mo', interval: '30m' },
  '3M': { range: '3mo', interval: '1d' },
  '6M': { range: '6mo', interval: '1d' },
  '1Y': { range: '1y', interval: '1d' },
  '3Y': { range: '3y', interval: '1wk' },
  '5Y': { range: '5y', interval: '1wk' },
  ALL: { range: 'max', interval: '1mo' },
};

const num = (v) => {
  const n = typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
};
const raw = (o) => num(o && typeof o === 'object' ? o.raw : o);
const pos = (v) => (typeof v === 'number' && v > 0 ? v : null);

/** Yahoo tickers to try, best first. */
export function yahooCandidates(rawSymbol, market, exchange) {
  const base = String(rawSymbol).trim().toUpperCase();
  if (market === 'US') return [base];
  if (/\.(NS|BO)$/.test(base)) return [base];
  if (/^\d{5,6}$/.test(base)) return [`${base}.BO`];
  return exchange === 'BSE' ? [`${base}.BO`, `${base}.NS`] : [`${base}.NS`, `${base}.BO`];
}

// ---------------------------------------------------------------- chart

export async function fetchHistory(rawSymbol, market, exchange, rangeKey) {
  const cfg = RANGES[rangeKey] ?? RANGES['1D'];
  for (const sym of yahooCandidates(rawSymbol, market, exchange)) {
    let res;
    try {
      res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=${cfg.interval}&range=${cfg.range}`,
        { headers: { 'User-Agent': UA } }
      );
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const result = (await res.json().catch(() => null))?.chart?.result?.[0];
    const ts = result?.timestamp;
    const q = result?.indicators?.quote?.[0];
    if (!Array.isArray(ts) || !q) continue;
    const points = [];
    for (let i = 0; i < ts.length; i++) {
      const c = num(q.close?.[i]);
      if (c === null || c <= 0) continue;
      // [time ms, open, high, low, close, volume] — a candle with a missing leg is flattened to its close.
      points.push([ts[i] * 1000, num(q.open?.[i]) ?? c, num(q.high?.[i]) ?? c, num(q.low?.[i]) ?? c, c, num(q.volume?.[i]) ?? 0]);
    }
    if (points.length < 2) continue;
    const meta = result.meta ?? {};
    return {
      symbol: sym,
      range: rangeKey in RANGES ? rangeKey : '1D',
      currency: meta.currency ?? (market === 'US' ? 'USD' : 'INR'),
      timezone: meta.exchangeTimezoneName ?? (market === 'US' ? 'America/New_York' : 'Asia/Kolkata'),
      previousClose: pos(num(meta.chartPreviousClose ?? meta.previousClose)),
      points,
    };
  }
  return null;
}

// ---------------------------------------------------------------- dividends

/** Past dividend payments (ex-date + amount per share), newest first, from Yahoo's chart events. */
export async function fetchDividends(rawSymbol, market, exchange) {
  for (const sym of yahooCandidates(rawSymbol, market, exchange)) {
    let res;
    try {
      res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1mo&range=10y&events=div`,
        { headers: { 'User-Agent': UA } }
      );
    } catch {
      continue;
    }
    if (!res.ok) continue;
    const result = (await res.json().catch(() => null))?.chart?.result?.[0];
    if (!result) continue;
    const dividends = Object.values(result.events?.dividends ?? {})
      .map((d) => ({ date: (num(d?.date) ?? 0) * 1000, amount: num(d?.amount) }))
      .filter((d) => d.date > 0 && d.amount !== null && d.amount > 0)
      .sort((x, y) => y.date - x.date);
    return {
      symbol: sym,
      currency: result.meta?.currency ?? (market === 'US' ? 'USD' : 'INR'),
      dividends,
    };
  }
  return null;
}

// ---------------------------------------------------------------- helpers

/** Resolve with `fallback` if `promise` takes longer than `ms` (or fails). Slow optional
 *  sources must never hold up the whole page. */
function within(promise, ms, fallback = null) {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(fallback), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(t); resolve(v); },
      () => { clearTimeout(t); resolve(fallback); }
    );
  });
}

// Finished answers are kept per warm server instance so repeat opens are instant.
const detailCache = new Map(); // key -> { data, at }
const DETAIL_TTL_MS = 5 * 60 * 1000;

// ---------------------------------------------------------------- yahoo summary

async function quoteSummary(sym, retry = true) {
  const s = await getSession();
  const modules = 'price,summaryDetail,defaultKeyStatistics,financialData,assetProfile';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=${modules}&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: s.cookie } });
  if ((res.status === 401 || res.status === 403) && retry) {
    await getSession(true);
    return quoteSummary(sym, false);
  }
  if (!res.ok) return null;
  return (await res.json())?.quoteSummary?.result?.[0] ?? null;
}

async function timeseries(sym, types) {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - 7 * 365 * 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types.join(',')}&merge=false&period1=${p1}&period2=${p2}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return {};
  const out = {};
  for (const r of (await res.json())?.timeseries?.result ?? []) {
    const t = r?.meta?.type?.[0];
    if (t && Array.isArray(r[t])) {
      out[t] = r[t]
        .filter((x) => x?.asOfDate && typeof x?.reportedValue?.raw === 'number')
        .map((x) => ({ date: x.asOfDate, value: x.reportedValue.raw }))
        .sort((a, b) => a.date.localeCompare(b.date));
    }
  }
  return out;
}

// ---------------------------------------------------------------- financials

const DAY = 86400000;
const near = (a, b, days) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) <= days * DAY;
const pct = (now, before) => (now !== null && before !== null && before > 0 ? ((now - before) / before) * 100 : null);

/** Merge revenue + profit series into rows [{date, revenue, profit, revenueYoy, profitYoy}], newest last. */
export function buildPeriods(revenue, profit, yearGapDays, keep) {
  const dates = [...new Set([...(revenue ?? []), ...(profit ?? [])].map((p) => p.date))].sort();
  const at = (series, d) => (series ?? []).find((p) => p.date === d)?.value ?? null;
  const rows = dates.map((date) => {
    const prior = dates.find((d) => near(d, new Date(new Date(date).getTime() - yearGapDays * DAY).toISOString().slice(0, 10), 25) && d < date);
    const revenueNow = at(revenue, date);
    const profitNow = at(profit, date);
    return {
      date,
      revenue: revenueNow,
      profit: profitNow,
      revenueYoy: prior ? pct(revenueNow, at(revenue, prior)) : null,
      profitYoy: prior ? pct(profitNow, at(profit, prior)) : null,
    };
  });
  return rows.slice(-keep);
}

const sum = (xs) => xs.reduce((a, b) => a + b, 0);

/** 1Y growth (trailing four quarters vs the four before; latest vs previous year when the
 *  quarters are too few) and the 3-year CAGR from the annual series. */
export function buildGrowth(quarterly, annual) {
  const q = (quarterly ?? []).map((p) => p.value);
  const a = (annual ?? []).map((p) => p.value);
  let ttm = null;
  let basis = null;
  if (q.length >= 8) {
    ttm = pct(sum(q.slice(-4)), sum(q.slice(-8, -4)));
    basis = 'ttm';
  } else if (a.length >= 2) {
    ttm = pct(a[a.length - 1], a[a.length - 2]);
    basis = 'annual';
  }
  let cagr3 = null;
  if (a.length >= 4) {
    const now = a[a.length - 1];
    const then = a[a.length - 4];
    if (now > 0 && then > 0) cagr3 = (Math.pow(now / then, 1 / 3) - 1) * 100;
  }
  return { ttm, basis, cagr3 };
}

// ---------------------------------------------------------------- NSE

const MONTHS = { JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11 };
function nseDate(s) {
  const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(String(s ?? '').trim());
  if (!m || MONTHS[m[2].toUpperCase()] === undefined) return null;
  return new Date(Date.UTC(+m[3], MONTHS[m[2].toUpperCase()], +m[1])).toISOString().slice(0, 10);
}

/** Promoter / public holding per quarter, oldest first, last five quarters.
 *  NSE's "public" is everyone who is not a promoter (so it already includes FII and DII);
 *  the FII / DII split is only filled in when a row carries it. */
export function parseShareholding(rows) {
  if (!Array.isArray(rows)) return [];
  const byDate = new Map();
  for (const r of rows) {
    const date = nseDate(r?.date);
    const promoters = num(r?.pr_and_prgrp);
    const pub = num(r?.public_val);
    if (!date || promoters === null || pub === null) continue;
    byDate.set(date, {
      date,
      promoters,
      public: pub,
      dii: num(r?.dii ?? r?.dii_val),
      fii: num(r?.fii ?? r?.fii_val),
      _sub: String(r?.submissionDate ?? r?.broadcastDt ?? ''),
    });
  }
  return [...byDate.values()]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-5)
    .map(({ _sub, ...rest }) => rest);
}

// ---------------------------------------------------------------- FII / DII split

// NSE's summary feed only has promoter vs public. The FII / DII split lives in the XBRL
// filing each row links to, so read it from there. Everything here fails soft: if a file
// is missing or laid out differently, that quarter simply keeps showing no FII / DII.

/** quarter-end date -> XBRL url, from the same NSE rows parseShareholding reads. */
export function holdingXbrlUrls(rows) {
  const out = new Map();
  if (!Array.isArray(rows)) return out;
  for (const r of rows) {
    const date = nseDate(r?.date);
    const url = typeof r?.xbrl === 'string' ? r.xbrl.trim() : '';
    if (date && /^https:\/\//i.test(url)) out.set(date, url);
  }
  return out;
}

const localName = (s) => String(s ?? '').replace(/^[^:]*:/, '');

/** { dii, fii } as percent of all shares, or null when the file has neither. */
export function parseHoldingXbrl(xml) {
  if (typeof xml !== 'string' || xml.length < 200) return null;

  // context id -> lower-cased dimension member names, e.g. ['foreignportfolioinvestorcategoryimember']
  const ctx = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?context\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?context>/g)) {
    const members = [...m[2].matchAll(/<(?:[\w-]+:)?explicitMember\b[^>]*>\s*([^<\s]+)\s*<\/(?:[\w-]+:)?explicitMember>/g)].map((x) => localName(x[1]).toLowerCase());
    ctx.set(m[1], members);
  }
  if (!ctx.size) return null;

  // "Shareholding as a % of total number of shares" facts, grouped by element name.
  const byElement = new Map();
  for (const m of xml.matchAll(/<(?:[\w-]+:)?(Shareholding[\w]*Percentage[\w]*)\b[^>]*\bcontextRef="([^"]+)"[^>]*>\s*([-+]?\d*\.?\d+(?:[eE][-+]?\d+)?)\s*<\//g)) {
    const v = parseFloat(m[3]);
    if (!Number.isFinite(v)) continue;
    if (!byElement.has(m[1])) byElement.set(m[1], []);
    byElement.get(m[1]).push({ ctx: m[2], v });
  }
  const facts = byElement.get('ShareholdingAsAPercentageOfTotalNumberOfShares') ?? [...byElement.values()].sort((a, b) => b.length - a.length)[0];
  if (!facts?.length) return null;

  // Values may be stored as 0.0465 (fraction) or 4.65 (percent): the 100% total tells which.
  const scale = Math.max(...facts.map((f) => f.v)) <= 1.0001 ? 100 : 1;

  let diiTotal = null, fiiTotal = null, diiSum = 0, fiiSum = 0, diiSeen = false, fiiSeen = false;
  for (const f of facts) {
    const names = ctx.get(f.ctx);
    if (!names?.length) continue;
    const key = names.join('|');
    const v = f.v * scale;
    if (/institutions?foreign|foreigninstitutions?/.test(key)) { fiiTotal = fiiTotal ?? v; continue; }
    if (/institutions?domestic|domesticinstitutions?/.test(key)) { diiTotal = diiTotal ?? v; continue; }
    if (/subtotal|^total|totalpublic|publicshareholding|promoter/.test(key)) continue;
    if (/foreign|fpi|overseas/.test(key)) { fiiSum += v; fiiSeen = true; continue; }
    if (/mutualfund|alternateinvestment|aif|bank|insurance|provident|pension|assetreconstruction|nbfc|financialinstitution|venturecapital|sovereignwealth/.test(key)) { diiSum += v; diiSeen = true; }
  }

  const dii = diiTotal ?? (diiSeen ? diiSum : null);
  const fii = fiiTotal ?? (fiiSeen ? fiiSum : null);
  if (dii === null && fii === null) return null;
  const round = (x) => Math.round((x ?? 0) * 100) / 100;
  const out = { dii: round(dii), fii: round(fii) };
  return out.dii >= 0 && out.fii >= 0 && out.dii + out.fii <= 100.01 ? out : null;
}

const holdingXbrlCache = new Map(); // url -> { split, at }
const HOLDING_TTL_MS = 30 * 24 * 60 * 60 * 1000; // a filed quarter never changes

async function holdingSplit(url) {
  const hit = holdingXbrlCache.get(url);
  if (hit && Date.now() - hit.at < HOLDING_TTL_MS) return hit.split;
  let split = null;
  let failed = false;
  try {
    split = parseHoldingXbrl(await fetchNseText(url, 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern'));
  } catch {
    failed = true;
  }
  // A network failure is retried soon; a file we could read but not understand is remembered.
  holdingXbrlCache.set(url, { split, at: Date.now() - (failed ? HOLDING_TTL_MS - 5 * 60 * 1000 : 0) });
  return split;
}

/** Adds FII / DII to every quarter that lacks them, and takes them out of "public"
 *  so Promoters + FIIs + DIIs + Public adds up to 100%. */
async function enrichShareholding(detail, nseRows) {
  const urls = holdingXbrlUrls(nseRows);
  const todo = (detail?.shareholding ?? []).filter((q) => (q.dii === null || q.fii === null) && urls.has(q.date));
  if (!todo.length) return detail;
  await within(
    Promise.all(
      todo.map(async (q) => {
        const s = await holdingSplit(urls.get(q.date));
        if (!s) return;
        q.dii = s.dii;
        q.fii = s.fii;
        q.public = Math.max(0, Math.round((q.public - s.dii - s.fii) * 100) / 100);
      })
    ),
    6000,
    null
  );
  return detail;
}

// NSE often rejects the first call on a cold session (it drops the cookie and the
// next call works), so try up to three times before giving up on it.
async function nseSafe(path, referer) {
  // Two quick tries, each capped, and the caller also time-boxes the pair.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await fetchNseJson(path, referer);
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  return null;
}

// ---------------------------------------------------------------- industry P/E

const peCache = new Map(); // symbol -> { pe, at }
const PE_TTL_MS = 6 * 60 * 60 * 1000;

async function trailingPe(bare) {
  const hit = peCache.get(bare);
  if (hit && Date.now() - hit.at < PE_TTL_MS) return hit.pe;
  let pe = null;
  try {
    const s = await quoteSummary(`${bare}.NS`);
    const v = pos(raw(s?.summaryDetail?.trailingPE));
    pe = v !== null && v < 200 ? v : null; // ignore meaningless outliers
  } catch {
    /* peer unavailable */
  }
  peCache.set(bare, { pe, at: Date.now() });
  return pe;
}

/** Median trailing P/E of the stock's peer group, excluding the stock itself. */
async function peerMedianPe(bare, industryText) {
  const group = peerGroupFor(bare, industryText);
  if (!group) return null;
  const pes = (await Promise.all(group.symbols.filter((x) => x !== bare).map(trailingPe))).filter((v) => v !== null).sort((a, b) => a - b);
  if (pes.length < 3) return null;
  const mid = Math.floor(pes.length / 2);
  const med = pes.length % 2 ? pes[mid] : (pes[mid - 1] + pes[mid]) / 2;
  return Math.round(med * 100) / 100;
}

// ---------------------------------------------------------------- founded year

// Neither Yahoo nor NSE give a founding year, so look it up on Wikidata (property P571,
// "inception"). Hand-entered values in stockOverrides.js still win over this.
const foundedCache = new Map(); // company name -> { year, at }
const FOUNDED_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const WIKI_HEADERS = { 'User-Agent': 'Aurafin/1.0 (stock detail lookup)', Accept: 'application/json' };

async function wikidataFoundedYear(name) {
  const clean = String(name ?? '')
    .replace(/\b(limited|ltd|incorporated|inc|corporation|corp|co|plc)\b\.?/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (clean.length < 2) return null;

  const search = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(clean)}&language=en&type=item&limit=6&format=json&origin=*`,
    { headers: WIKI_HEADERS }
  );
  if (!search.ok) return null;
  const ids = ((await search.json())?.search ?? []).map((r) => r.id).filter(Boolean);
  if (!ids.length) return null;

  const ents = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids.join('|')}&props=claims|descriptions&languages=en&format=json&origin=*`,
    { headers: WIKI_HEADERS }
  );
  if (!ents.ok) return null;
  const entities = (await ents.json())?.entities ?? {};

  const COMPANY = /compan|corporation|conglomerate|bank|enterprise|firm|manufactur|producer|retailer|brand|group/i;
  let fallback = null;
  for (const id of ids) {
    const e = entities[id];
    const time = e?.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time; // e.g. "+1910-08-24T00:00:00Z"
    const year = time ? parseInt(String(time).replace(/^\+/, ''), 10) : NaN;
    if (!Number.isFinite(year) || year < 1500 || year > new Date().getFullYear()) continue;
    const listed = Boolean(e.claims?.P414 || e.claims?.P249); // has a stock exchange / ticker
    if (listed) return year;
    if (!fallback && COMPANY.test(e?.descriptions?.en?.value ?? '')) fallback = year;
  }
  return fallback;
}

async function foundedYearFor(name) {
  if (!name) return null;
  const hit = foundedCache.get(name);
  if (hit && Date.now() - hit.at < FOUNDED_TTL_MS) return hit.year;
  let year = null;
  try {
    year = await wikidataFoundedYear(name);
  } catch {
    /* lookup failed: leave blank */
  }
  foundedCache.set(name, { year, at: Date.now() - (year === null ? FOUNDED_TTL_MS - 10 * 60 * 1000 : 0) }); // retry misses after 10 min
  return year;
}

/** Fill about.founded from Wikidata when nothing else provided it. Never slows the page by more than 2.5s. */
async function fillFounded(detail) {
  if (detail?.about && detail.about.founded == null && detail.name) {
    detail.about.founded = await within(foundedYearFor(detail.name), 2500, null);
  }
  return detail;
}

// ---------------------------------------------------------------- detail

function pickCeo(officers) {
  if (!Array.isArray(officers)) return null;
  const hit =
    officers.find((o) => /managing director|\bmd\b|\bceo\b|chief executive/i.test(o?.title ?? '')) ?? null;
  // Yahoo gives the formal name ("Mr. Moolchand Kiran Kumar Jain"); drop the title.
  return hit?.name ? hit.name.replace(/^(mr|mrs|ms|dr|shri|smt|prof)\.?\s+/i, '').trim() : null;
}

const asPercent = (v) => (v === null ? null : v > 1 ? v : v * 100);

export async function fetchDetail(rawSymbol, market, exchange) {
  const cacheKey = `${market}:${exchange}:${String(rawSymbol).toUpperCase()}`;
  const hit = detailCache.get(cacheKey);
  if (hit && Date.now() - hit.at < DETAIL_TTL_MS) return hit.data;

  const candidates = yahooCandidates(rawSymbol, market, exchange);
  const first = candidates[0];
  const firstBare = first.replace(/\.(NS|BO)$/, '');
  const useNseEarly = market === 'IN' && /^[A-Z0-9&-]+$/.test(firstBare) && !/^\d+$/.test(firstBare);

  // Start every independent source at once. Previously NSE and the financials only began
  // after Yahoo's summary had finished, so their waits were added together.
  const tsP = within(timeseries(first, ['quarterlyTotalRevenue', 'quarterlyNetIncome', 'annualTotalRevenue', 'annualNetIncome']), 7000, {});
  const nseQuoteP = useNseEarly
    ? within(nseSafe(`quote-equity?symbol=${encodeURIComponent(firstBare)}`, `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(firstBare)}`), 5000, null)
    : Promise.resolve(null);
  const nseHoldP = useNseEarly
    ? within(nseSafe(`corporate-share-holdings-master?index=equities&symbol=${encodeURIComponent(firstBare)}`, 'https://www.nseindia.com/companies-listing/corporate-filings-shareholding-pattern'), 5000, null)
    : Promise.resolve(null);

  let sym = null;
  let sum_ = null;
  for (const c of candidates) {
    try {
      const s = await within(quoteSummary(c), 7000, null);
      if (s && (raw(s.price?.regularMarketPrice) !== null || raw(s.summaryDetail?.previousClose) !== null)) {
        sym = c;
        sum_ = s;
        break;
      }
    } catch {
      /* try next */
    }
  }

  // Yahoo's summary is blocked or slow: still answer with whatever NSE + the chart gave,
  // so the page shows real numbers instead of an error.
  if (!sym) {
    const [nseQ, nseH, tsF] = await Promise.all([nseQuoteP, nseHoldP, tsP]);
    const nseOk = nseQ && String(nseQ?.info?.symbol ?? '').toUpperCase() === firstBare ? nseQ : null;
    const hist = await within(fetchHistory(rawSymbol, market, exchange, '1Y'), 6000, null);
    if (!nseOk && !hist) return null;
    const pi = nseOk?.priceInfo ?? {};
    const closes = hist ? hist.points.map((p) => p[4]) : [];
    const quarterlyF = buildPeriods(tsF.quarterlyTotalRevenue, tsF.quarterlyNetIncome, 365, 5);
    const yearlyF = buildPeriods(tsF.annualTotalRevenue, tsF.annualNetIncome, 365, 5);
    const partial = {
      symbol: firstBare,
      yahooSymbol: hist?.symbol ?? first,
      name: nseOk?.info?.companyName ?? null,
      currency: hist?.currency ?? (market === 'US' ? 'USD' : 'INR'),
      exchange: market === 'US' ? 'US' : exchange,
      performance: {
        open: pos(num(pi.open)),
        previousClose: pos(num(pi.previousClose)) ?? hist?.previousClose ?? null,
        dayLow: pos(num(pi.intraDayHighLow?.min)),
        dayHigh: pos(num(pi.intraDayHighLow?.max)),
        weekLow52: pos(num(pi.weekHighLow?.min)) ?? (closes.length ? Math.min(...closes) : null),
        weekHigh52: pos(num(pi.weekHighLow?.max)) ?? (closes.length ? Math.max(...closes) : null),
        volume: null,
        lowerCircuit: pos(num(pi.lowerCP)),
        upperCircuit: pos(num(pi.upperCP)),
      },
      fundamentals: {
        marketCap: null, pe: pos(num(nseOk?.metadata?.pdSymbolPe)), pb: null,
        industryPe: pos(num(nseOk?.metadata?.pdSectorPe)) ?? pos(num(nseOk?.metadata?.pdSectorPE)),
        debtToEquity: null, roe: null, eps: null, dividendYield: null, bookValue: null,
        faceValue: pos(num(nseOk?.securityInfo?.faceValue)) ?? pos(num(nseOk?.faceValue)),
      },
      financials: {
        quarterly: quarterlyF,
        yearly: yearlyF,
        growth: {
          revenue: { quarterly: buildGrowth(tsF.quarterlyTotalRevenue, tsF.annualTotalRevenue) },
          profit: { quarterly: buildGrowth(tsF.quarterlyNetIncome, tsF.annualNetIncome) },
        },
      },
      shareholding: parseShareholding(nseH),
      about: { description: null, ceo: null, industry: nseOk?.industryInfo?.basicIndustry ?? nseOk?.industryInfo?.industry ?? null, sector: nseOk?.industryInfo?.sector ?? null, website: null, employees: null, founded: null },
      asOf: new Date().toISOString(),
      partial: true,
    };
    const out = applyOverrides(partial);
    await Promise.all([fillFounded(out), enrichShareholding(out, nseH)]);
    return out;
  }

  const bare = sym.replace(/\.(NS|BO)$/, '');
  const useNse = useNseEarly && bare === firstBare;
  // If the .BO fallback won, the early timeseries (for .NS) may be empty: refetch only then.
  const [nseQuote, nseHold, ts] = await Promise.all([
    useNse ? nseQuoteP : null,
    useNse ? nseHoldP : null,
    sym === first ? tsP : within(timeseries(sym, ['quarterlyTotalRevenue', 'quarterlyNetIncome', 'annualTotalRevenue', 'annualNetIncome']), 7000, {}),
  ]);

  // NSE's own answer for the symbol, never another company's.
  const nse = nseQuote && String(nseQuote?.info?.symbol ?? '').toUpperCase() === bare ? nseQuote : null;
  const pi = nse?.priceInfo ?? {};
  const sd = sum_.summaryDetail ?? {};
  const ks = sum_.defaultKeyStatistics ?? {};
  const fd = sum_.financialData ?? {};
  const pr = sum_.price ?? {};
  const profile = sum_.assetProfile ?? {};

  const price = raw(pr.regularMarketPrice);
  const shares = raw(ks.sharesOutstanding) ?? raw(ks.impliedSharesOutstanding);
  const marketCap = pos(raw(pr.marketCap)) ?? pos(raw(sd.marketCap)) ?? (pos(shares) && pos(price) ? shares * price : null);
  const bookValue = pos(raw(ks.bookValue));
  const de = raw(fd.debtToEquity);
  // Yahoo leaves returnOnEquity empty for many Indian stocks; EPS / book value is the same ratio.
  const eps = raw(ks.trailingEps);
  const roe = raw(fd.returnOnEquity) ?? (eps !== null && bookValue ? eps / bookValue : null);
  const dy = raw(sd.dividendYield) ?? raw(sd.trailingAnnualDividendYield);

  const quarterly = buildPeriods(ts.quarterlyTotalRevenue, ts.quarterlyNetIncome, 365, 5);
  const yearly = buildPeriods(ts.annualTotalRevenue, ts.annualNetIncome, 365, 5);

  // For Indian stocks the exchange's own classification is closer to what Indian sites show than Yahoo's global one.
  const industry = (market === 'IN' ? nse?.industryInfo?.basicIndustry ?? nse?.industryInfo?.industry : null) ?? profile.industry ?? nse?.industryInfo?.sector ?? null;

  const detail = applyOverrides({
    symbol: bare,
    yahooSymbol: sym,
    name: pr.longName ?? pr.shortName ?? nse?.info?.companyName ?? null,
    currency: pr.currency ?? (market === 'US' ? 'USD' : 'INR'),
    exchange: market === 'US' ? 'US' : sym.endsWith('.BO') ? 'BSE' : 'NSE',
    performance: {
      open: pos(num(pi.open)) ?? pos(raw(sd.open)) ?? pos(raw(pr.regularMarketOpen)),
      previousClose: pos(num(pi.previousClose)) ?? pos(raw(sd.previousClose)) ?? pos(raw(pr.regularMarketPreviousClose)),
      dayLow: pos(num(pi.intraDayHighLow?.min)) ?? pos(raw(sd.dayLow)) ?? pos(raw(pr.regularMarketDayLow)),
      dayHigh: pos(num(pi.intraDayHighLow?.max)) ?? pos(raw(sd.dayHigh)) ?? pos(raw(pr.regularMarketDayHigh)),
      weekLow52: pos(num(pi.weekHighLow?.min)) ?? pos(raw(sd.fiftyTwoWeekLow)),
      weekHigh52: pos(num(pi.weekHighLow?.max)) ?? pos(raw(sd.fiftyTwoWeekHigh)),
      volume: pos(num(nse?.preOpenMarket?.totalTradedVolume)) ?? pos(raw(pr.regularMarketVolume)) ?? pos(raw(sd.volume)),
      lowerCircuit: pos(num(pi.lowerCP)),
      upperCircuit: pos(num(pi.upperCP)),
    },
    fundamentals: {
      marketCap,
      pe: pos(raw(sd.trailingPE)) ?? pos(num(nse?.metadata?.pdSymbolPe)),
      pb: pos(raw(ks.priceToBook)) ?? (bookValue && price ? price / bookValue : null),
      industryPe: pos(num(nse?.metadata?.pdSectorPe)) ?? pos(num(nse?.metadata?.pdSectorPE)),
      debtToEquity: de === null ? null : de / 100, // Yahoo gives it as a percentage
      roe: roe === null ? null : roe * 100,
      eps,
      dividendYield: asPercent(dy),
      bookValue,
      faceValue: pos(num(nse?.securityInfo?.faceValue)) ?? pos(num(nse?.faceValue)),
    },
    financials: {
      quarterly,
      yearly,
      growth: {
        revenue: {
          quarterly: buildGrowth(ts.quarterlyTotalRevenue, ts.annualTotalRevenue),
        },
        profit: {
          quarterly: buildGrowth(ts.quarterlyNetIncome, ts.annualNetIncome),
        },
      },
    },
    shareholding: parseShareholding(nseHold),
    about: {
      description: profile.longBusinessSummary ?? null,
      ceo: pickCeo(profile.companyOfficers),
      industry,
      sector: profile.sector ?? null,
      website: profile.website ?? null,
      employees: raw(profile.fullTimeEmployees),
      founded: null,
    },
    asOf: new Date().toISOString(),
  });

  await Promise.all([fillFounded(detail), enrichShareholding(detail, nseHold)]);

  // NSE did not give an Industry P/E: work one out from the peer group instead.
  if (market === 'IN' && detail.fundamentals.industryPe === null) {
    // Optional extra: never let the peer lookups hold the page up for more than 2.5s.
    detail.fundamentals.industryPe = await within(
      peerMedianPe(bare, `${detail.about.industry ?? ''} ${detail.about.sector ?? ''}`),
      2500,
      null
    );
  }
  detailCache.set(cacheKey, { data: detail, at: Date.now() });
  return detail;
}

// ---------------------------------------------------------------- shared route

/** Handles ?mode=history / ?mode=detail for valuation.js and the Vite dev middleware.
 *  Returns null for any other mode, else { status, body, cache }. */
export async function handleStockQuery(query) {
  const mode = query.mode;
  if (mode !== 'history' && mode !== 'detail' && mode !== 'dividends') return null;
  const symbol = String(query.symbol ?? '').trim();
  if (!symbol) return { status: 400, body: { error: 'Missing symbol' } };
  const market = String(query.market ?? 'IN').toUpperCase() === 'US' ? 'US' : 'IN';
  const exchange = String(query.exchange ?? 'NSE').toUpperCase() === 'BSE' ? 'BSE' : 'NSE';
  try {
    if (mode === 'dividends') {
      const data = await fetchDividends(symbol, market, exchange);
      if (!data) return { status: 404, body: { error: `No dividend data for ${symbol}` } };
      return { status: 200, body: data, cache: 's-maxage=3600, stale-while-revalidate=86400' };
    }
    if (mode === 'history') {
      const rangeKey = String(query.range ?? '1D').toUpperCase();
      const data = await fetchHistory(symbol, market, exchange, rangeKey in RANGES ? rangeKey : '1D');
      if (!data) return { status: 404, body: { error: `No price history for ${symbol}` } };
      return { status: 200, body: data, cache: rangeKey === '1D' || rangeKey === '1W' ? 's-maxage=15, stale-while-revalidate=30' : 's-maxage=300, stale-while-revalidate=900' };
    }
    const data = await fetchDetail(symbol, market, exchange);
    if (!data) return { status: 404, body: { error: `No details found for ${symbol}` } };
    return { status: 200, body: data, cache: 's-maxage=120, stale-while-revalidate=900' };
  } catch {
    return { status: 502, body: { error: 'Could not reach the stock data source' } };
  }
}
