// Shared Indian-market symbol search used by the serverless function and the
// Vite dev middleware.
//
// Newly listed shares were missing because:
//  - NSE's autocomplete only matches one token, so "MONEY VIEW" (with a
//    space) found nothing even though MONEYVIEW is listed; and
//  - as soon as NSE returned *anything*, Yahoo (which also indexes BSE-only
//    listings) was never consulted, and vice-versa when NSE came back empty.
// This runs several query variants against NSE and Yahoo together, then
// merges and de-duplicates the results (NSE first).
import { searchNseSymbol } from './nse.js';

import { fetch } from './fetchTimeout.js';
const IN_EXCHANGES = new Set(['NSI', 'BSE']);
const isIndianSymbol = (symbol) => /\.(NS|BO)$/i.test(symbol ?? '');
const baseOf = (symbol) => String(symbol ?? '').replace(/\.(NS|BO)$/i, '').toUpperCase();

// ---------------------------------------------------------------------------
// Well-known Indian shares people type by nickname or with an "&" ("L&T", "M&M").
// NSE's autocomplete and Yahoo don't match those at all (L&T trades as "LT",
// Larsen & Toubro is stored with a spelled-out "&"), so they used to return
// nothing. Each entry lists the names/nicknames it answers to; the first
// matching entries are put at the very top of the results.
// ---------------------------------------------------------------------------
const ALIASES = [
  { symbol: 'LT', name: 'Larsen & Toubro Ltd', keys: ['L&T', 'LNT', 'L AND T', 'LARSEN & TOUBRO', 'LARSEN AND TOUBRO', 'LARSEN'] },
  { symbol: 'LTF', name: 'L&T Finance Ltd', keys: ['L&T FINANCE', 'LT FINANCE', 'L&T FIN', 'LTFH', 'L&T FINANCE HOLDINGS'] },
  { symbol: 'LTTS', name: 'L&T Technology Services Ltd', keys: ['L&T TECHNOLOGY', 'L&T TECH', 'L&T TECHNOLOGY SERVICES', 'LTTS'] },
  { symbol: 'LTIM', name: 'LTIMindtree Ltd', keys: ['LTIMINDTREE', 'LTI MINDTREE', 'L&T INFOTECH', 'LTIM'] },
  { symbol: 'M&M', name: 'Mahindra & Mahindra Ltd', keys: ['M&M', 'MNM', 'M AND M', 'MAHINDRA & MAHINDRA', 'MAHINDRA AND MAHINDRA', 'MAHINDRA'] },
  { symbol: 'M&MFIN', name: 'Mahindra & Mahindra Financial Services Ltd', keys: ['M&M FINANCE', 'M&M FIN', 'M&M FINANCIAL', 'MAHINDRA FINANCE', 'MAHINDRA & MAHINDRA FINANCIAL SERVICES'] },
  { symbol: 'ABB', name: 'ABB India Ltd', keys: ['ABB', 'ABB INDIA'] },
  { symbol: 'POWERINDIA', name: 'Hitachi Energy India Ltd', keys: ['HITACHI ENERGY', 'ABB POWER', 'ABB POWER PRODUCTS'] },
  { symbol: 'J&KBANK', name: 'Jammu & Kashmir Bank Ltd', keys: ['J&K BANK', 'JK BANK', 'JAMMU & KASHMIR BANK', 'JAMMU AND KASHMIR BANK'] },
  { symbol: 'PGHH', name: 'Procter & Gamble Hygiene and Health Care Ltd', keys: ['P&G', 'P&G HYGIENE', 'PROCTER & GAMBLE', 'PROCTER AND GAMBLE'] },
  { symbol: 'GVKPIL', name: 'GVK Power & Infrastructure Ltd', keys: ['GVK POWER'] },
  { symbol: 'GMRP&UI', name: 'GMR Power and Urban Infra Ltd', keys: ['GMR POWER', 'GMR POWER & URBAN INFRA'] },
  { symbol: 'GMRAIRPORT', name: 'GMR Airports Ltd', keys: ['GMR AIRPORTS', 'GMR INFRA', 'GMR'] },
  { symbol: 'M&MFIN', name: 'Mahindra & Mahindra Financial Services Ltd', keys: ['MMFSL'] },
  { symbol: 'SURYAROSNI', name: 'Surya Roshni Ltd', keys: ['SURYA ROSHNI'] },
  { symbol: 'AAVAS', name: 'Aavas Financiers Ltd', keys: ['AAVAS'] },
  { symbol: 'BAJAJ-AUTO', name: 'Bajaj Auto Ltd', keys: ['BAJAJ AUTO', 'BAJAJAUTO'] },
  { symbol: 'BAJFINANCE', name: 'Bajaj Finance Ltd', keys: ['BAJAJ FINANCE'] },
  { symbol: 'BAJAJFINSV', name: 'Bajaj Finserv Ltd', keys: ['BAJAJ FINSERV'] },
  { symbol: 'HINDUNILVR', name: 'Hindustan Unilever Ltd', keys: ['HUL', 'HINDUSTAN UNILEVER'] },
  { symbol: 'TATAMOTORS', name: 'Tata Motors Ltd', keys: ['TATA MOTORS'] },
  { symbol: 'RELIANCE', name: 'Reliance Industries Ltd', keys: ['RIL', 'RELIANCE INDUSTRIES', 'RELIANCE'] },
  { symbol: 'SBIN', name: 'State Bank of India', keys: ['SBI', 'STATE BANK OF INDIA'] },
  { symbol: 'HDFCBANK', name: 'HDFC Bank Ltd', keys: ['HDFC BANK'] },
  { symbol: 'ICICIBANK', name: 'ICICI Bank Ltd', keys: ['ICICI BANK'] },
  { symbol: 'INFY', name: 'Infosys Ltd', keys: ['INFOSYS'] },
  { symbol: 'TCS', name: 'Tata Consultancy Services Ltd', keys: ['TCS', 'TATA CONSULTANCY'] },
];

// "L&T", "L & T", "l and t" -> "LANDT": one comparable form for typed text and aliases.
const norm = (s) =>
  String(s ?? '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9]/g, '');

const ALIAS_INDEX = ALIASES.map((a) => ({
  ...a,
  nkeys: [...new Set([...a.keys, a.symbol, a.name].map(norm).filter(Boolean))],
}));

/** Aliases the typed text points at (exact first, then "starts with"). */
function aliasMatches(query) {
  const n = norm(query);
  if (n.length < 2) return [];
  const exact = [];
  const prefix = [];
  const seenSym = new Set();
  for (const a of ALIAS_INDEX) {
    if (seenSym.has(a.symbol)) continue;
    if (a.nkeys.includes(n)) {
      exact.push(a);
      seenSym.add(a.symbol);
    } else if (n.length >= 3 && a.nkeys.some((k) => k.startsWith(n))) {
      prefix.push(a);
      seenSym.add(a.symbol);
    }
  }
  return [...exact, ...prefix].map((a) => ({
    symbol: `${a.symbol}.NS`,
    name: a.name,
    exchDisp: 'NSE',
    exchange: 'NSI',
    quoteType: 'EQUITY',
    _alias: true,
  }));
}

// Both helpers return null when the upstream itself failed (blocked, timed out,
// bad status) and [] when it answered but found nothing. The difference matters:
// a failure must never be remembered as "no results".
async function searchYahooIndia(q) {
  try {
    const upstream = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!upstream.ok) return null;
    const data = await upstream.json();
    return (Array.isArray(data?.quotes) ? data.quotes : [])
      .filter(
        (r) =>
          r.symbol &&
          (r.quoteType === 'EQUITY' || r.quoteType === 'ETF') &&
          (isIndianSymbol(r.symbol) || (r.exchange && IN_EXCHANGES.has(r.exchange)))
      )
      .map((r) => ({
        symbol: r.symbol,
        name: r.shortname ?? r.longname ?? r.symbol,
        exchDisp: r.exchDisp,
        exchange: r.exchange,
        quoteType: r.quoteType,
      }));
  } catch {
    return null;
  }
}

async function safeNse(q) {
  try {
    return (await searchNseSymbol(q)).quotes;
  } catch {
    return null;
  }
}

/**
 * Returns { quotes, partial } or throws if every upstream failed outright.
 * `partial` is true when some (not all) lookups failed, so the list may be
 * incomplete and shouldn't be cached for long.
 */
export async function searchIndia(query) {
  const q = String(query ?? '').trim();
  const aliasHits = aliasMatches(q);
  const variants = [q];
  const compact = q.replace(/\s+/g, '');
  if (compact !== q) variants.push(compact); // "MONEY VIEW" -> "MONEYVIEW"
  // "&" confuses both upstreams: also try it spelled out ("M&M" -> "M AND M") and with
  // the alias's real symbol/name ("L&T" -> "LT", "Larsen & Toubro").
  if (q.includes('&')) {
    variants.push(q.replace(/\s*&\s*/g, ' and '));
    variants.push(q.replace(/\s*&\s*/g, ''));
  }
  for (const a of aliasHits.slice(0, 2)) variants.push(a.symbol.replace(/\.NS$/, ''));
  const firstWord = q.split(/\s+/)[0];
  if (firstWord && firstWord !== q && firstWord.length >= 3 && !firstWord.includes('&')) variants.push(firstWord);
  const uniq = [...new Set(variants.map((v) => v.trim()).filter(Boolean))];

  const [nseLists, yahooLists] = await Promise.all([
    Promise.all(uniq.slice(0, 5).map(safeNse)),
    Promise.all(uniq.slice(0, 4).map(searchYahooIndia)),
  ]);

  const lists = [...nseLists, ...yahooLists];
  const failed = lists.filter((l) => l === null).length;
  // Every lookup failed: report it (the handler answers 502, which isn't cached)
  // instead of returning an empty list that looks like "nothing matches". A known
  // nickname still answers from the built-in table even when both upstreams are down.
  if (failed === lists.length && aliasHits.length === 0) throw new Error('NSE and Yahoo Finance lookups all failed');

  const seen = new Set();
  const quotes = [];
  // Known nicknames first (their live name, when an upstream returned one, wins below).
  const upstream = lists.filter(Boolean).flat();
  const liveName = new Map(upstream.map((r) => [baseOf(r.symbol), r.name]));
  for (const r of [...aliasHits, ...upstream]) {
    const key = baseOf(r.symbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    quotes.push(r._alias && liveName.get(key) && liveName.get(key) !== key ? { ...r, name: liveName.get(key) } : r);
  }

  // Most relevant first: nicknames, then exact / prefix matches on the symbol or name.
  const needle = norm(q);
  const aliasSyms = new Set(aliasHits.map((a) => baseOf(a.symbol)));
  const score = (r) => {
    const sym = baseOf(r.symbol);
    if (aliasSyms.has(sym)) return -1;
    const symN = norm(sym);
    const nm = norm(r.name);
    if (symN === needle) return 0;
    if (symN.startsWith(needle) || nm.startsWith(needle)) return 1;
    if (symN.includes(needle) || nm.includes(needle)) return 2;
    return 3;
  };
  const ranked = quotes
    .map((r, i) => ({ r, i, s: score(r) }))
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.r);
  return { quotes: ranked.slice(0, 10).map(({ _alias, ...r }) => r), partial: failed > 0 };
}
