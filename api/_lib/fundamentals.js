// Fundamentals for the X/2 · X/3 valuation page: TTM EPS, analyst growth
// estimates, annual EPS history and the lowest historical P/E.
// Source: Yahoo Finance (unofficial endpoints, needs a cookie + crumb).
// Nothing here is invented: any field Yahoo does not return is null, and the
// UI then asks the person to enter it manually.
import { resolveQuote } from './quote.js';

import { fetch } from './fetchTimeout.js';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
let session = null; // { cookie, crumb, at } — reused while the function instance is warm

export async function getSession(force = false) {
  if (!force && session && Date.now() - session.at < 30 * 60 * 1000) return session;
  const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const raw = typeof r.headers.getSetCookie === 'function' ? r.headers.getSetCookie() : [r.headers.get('set-cookie')].filter(Boolean);
  const cookie = raw.map((c) => c.split(';')[0]).join('; ');
  const c = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = (await c.text()).trim();
  if (!c.ok || !crumb || crumb.includes('<')) throw new Error('crumb unavailable');
  session = { cookie, crumb, at: Date.now() };
  return session;
}

async function quoteSummary(sym, retry = true) {
  const s = await getSession();
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}?modules=price,defaultKeyStatistics,earningsTrend&crumb=${encodeURIComponent(s.crumb)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Cookie: s.cookie } });
  if ((res.status === 401 || res.status === 403) && retry) { await getSession(true); return quoteSummary(sym, false); }
  if (!res.ok) return null;
  return (await res.json())?.quoteSummary?.result?.[0] ?? null;
}

async function timeseries(sym, types, years) {
  const p2 = Math.floor(Date.now() / 1000);
  const p1 = p2 - Math.ceil(years + 1) * 365 * 86400;
  const url = `https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(sym)}?symbol=${encodeURIComponent(sym)}&type=${types.join(',')}&merge=false&period1=${p1}&period2=${p2}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) return {};
  const out = {};
  for (const r of (await res.json())?.timeseries?.result ?? []) {
    const t = r?.meta?.type?.[0];
    if (t && Array.isArray(r[t])) out[t] = r[t].filter((x) => x?.asOfDate && typeof x?.reportedValue?.raw === 'number').map((x) => ({ date: x.asOfDate, value: x.reportedValue.raw }));
  }
  return out;
}

async function monthlyCloses(sym, years) {
  const range = `${Math.min(10, Math.max(1, Math.ceil(years)))}y`;
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1mo&range=${range}`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return [];
  const r = (await res.json())?.chart?.result?.[0];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  return (r?.timestamp ?? []).map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), close: closes[i] })).filter((x) => x.close > 0);
}

// Newly listed shares have no annual EPS history and no P/E series on Yahoo,
// so the usual derivation returns nothing. Fall back to: the lowest daily
// close since listing ÷ the current trailing EPS. It is an approximation
// (labelled as such in `method`), but far better than an empty field.
async function listingLowPe(sym, ttmEps) {
  if (!(ttmEps > 0)) return null;
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=10y`, { headers: { 'User-Agent': UA } });
  if (!res.ok) return null;
  const r = (await res.json())?.chart?.result?.[0];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const pts = (r?.timestamp ?? [])
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: closes[i] / ttmEps }))
    .filter((x) => Number.isFinite(x.value) && x.value > 0 && x.value < 1000);
  const out = summarisePe(pts, 'lowest close since listing ÷ trailing EPS (limited history)');
  return out;
}

// P/E per month = month-end price ÷ the latest annual EPS already published at that time
// (fiscal year end + 90 days reporting lag). Only positive EPS counts.
export function derivePeSeries(prices, annualEps) {
  const eps = [...annualEps].filter((e) => e.value > 0).sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  for (const p of prices) {
    let cur = null;
    for (const e of eps) if (new Date(e.date).getTime() + 90 * 86400000 <= new Date(p.date).getTime()) cur = e; else break;
    if (cur) { const v = p.close / cur.value; if (v > 0 && v < 1000) out.push({ date: p.date, value: v }); }
  }
  return out;
}

export function summarisePe(series, method) {
  if (!series.length) return null;
  const low = series.reduce((a, b) => (b.value < a.value ? b : a));
  const from = series[0].date, to = series[series.length - 1].date;
  const spanYears = Math.max(0, (new Date(to).getTime() - new Date(from).getTime()) / (365.25 * 86400000));
  return { value: low.value, date: low.date, from, to, points: series.length, spanYears, method };
}

// Two independent P/E series can exist for one stock: Yahoo's own trailing-P/E
// history (long, but often only a handful of quarterly points) and the monthly
// series we derive from prices ÷ annual EPS (dense, but only as long as Yahoo's
// EPS history). Each series' minimum is only an UPPER bound on the true lowest
// P/E (a sparse series can step right over the low). The old rule kept whichever
// series had the longer span, so a sparse 6-year series beat a dense 4-year one
// and the real low was missed. The tightest bound is the lowest value across
// both; confidence still needs one reasonably dense series (the best one counts).
export function chooseLowestPe(a, b) {
  const list = [a, b].filter(Boolean);
  if (!list.length) return null;
  if (list.length === 1) return list[0];
  const low = list.reduce((m, s) => (s.value < m.value ? s : m));
  const other = list.find((s) => s !== low);
  return {
    value: low.value,
    date: low.date,
    from: list.map((s) => s.from).sort()[0],
    to: list.map((s) => s.to).sort().slice(-1)[0],
    points: Math.max(...list.map((s) => s.points)),
    spanYears: Math.max(...list.map((s) => s.spanYears)),
    method: `${low.method}, cross-checked with ${other.method}`,
  };
}

const raw = (o) => (typeof o?.raw === 'number' && Number.isFinite(o.raw) ? o.raw : null);

export async function fetchFundamentals(rawSymbol, exchange = 'NSE', lookbackYears = 10) {
  const base = String(rawSymbol).trim().toUpperCase();
  const candidates = /\.(NS|BO)$/.test(base) ? [base] : exchange === 'BSE' ? [`${base}.BO`, `${base}.NS`] : [`${base}.NS`, `${base}.BO`];
  for (const sym of candidates) {
    let sum = null;
    try { sum = await quoteSummary(sym); } catch { /* try next */ }
    const ttmEps = raw(sum?.defaultKeyStatistics?.trailingEps);
    if (!sum || (ttmEps === null && raw(sum?.price?.regularMarketPrice) === null)) continue;

    const ts = await timeseries(sym, ['annualDilutedEPS', 'trailingPeRatio'], lookbackYears).catch(() => ({}));
    const yahooPe = (ts.trailingPeRatio ?? []).filter((p) => p.value > 0 && p.value < 1000);
    let prices = [];
    try { prices = await monthlyCloses(sym, lookbackYears); } catch { /* derived series unavailable */ }
    const derived = derivePeSeries(prices, ts.annualDilutedEPS ?? []);
    // Lowest value across both series (see chooseLowestPe), not the longer-span one.
    const a = summarisePe(yahooPe, 'yahoo-trailing-pe'), b = summarisePe(derived, 'price-history ÷ annual EPS');
    let lowestPe = chooseLowestPe(a, b);
    if (!lowestPe) { try { lowestPe = await listingLowPe(sym, ttmEps); } catch { /* leave empty */ } }
    const priceHistoryYears = prices.length ? Math.max(0, (new Date(prices[prices.length - 1].date).getTime() - new Date(prices[0].date).getTime()) / (365.25 * 86400000)) : null;
    const trend = sum.earningsTrend?.trend ?? [];
    const g = (period) => { const v = raw(trend.find((t) => t.period === period)?.growth); return v === null ? null : v * 100; };

    let price = raw(sum.price?.regularMarketPrice);
    let source = 'Yahoo Finance';
    try { const q = await resolveQuote(base.replace(/\.(NS|BO)$/, ''), 'IN'); if (q?.price) { price = q.price; source = `Yahoo Finance (EPS/P/E) + ${q.source ?? 'live'} (price)`; } } catch { /* keep Yahoo price */ }

    return {
      symbol: base.replace(/\.(NS|BO)$/, ''),
      yahooSymbol: sym,
      name: sum.price?.longName ?? sum.price?.shortName ?? null,
      price,
      ttmEps,
      forwardEps: raw(sum.defaultKeyStatistics?.forwardEps),
      growth: { nextYear: g('+1y'), next5y: g('+5y') },
      // Oldest first: the growth maths (CAGR, cycle check) relies on the order.
      epsHistory: (ts.annualDilutedEPS ?? []).map((p) => ({ date: p.date, eps: p.value })).sort((x, y) => x.date.localeCompare(y.date)),
      lowestPe,
      priceHistoryYears,
      source,
      asOf: new Date().toISOString(),
    };
  }
  return null;
}
