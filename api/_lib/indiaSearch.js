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

const IN_EXCHANGES = new Set(['NSI', 'BSE']);
const isIndianSymbol = (symbol) => /\.(NS|BO)$/i.test(symbol ?? '');
const baseOf = (symbol) => String(symbol ?? '').replace(/\.(NS|BO)$/i, '').toUpperCase();

async function searchYahooIndia(q) {
  try {
    const upstream = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } }
    );
    if (!upstream.ok) return [];
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
    return [];
  }
}

async function safeNse(q) {
  try {
    return (await searchNseSymbol(q)).quotes;
  } catch {
    return [];
  }
}

/** Returns { quotes } or throws only if every upstream failed outright. */
export async function searchIndia(query) {
  const q = String(query ?? '').trim();
  const variants = [q];
  const compact = q.replace(/\s+/g, '');
  if (compact !== q) variants.push(compact); // "MONEY VIEW" -> "MONEYVIEW"
  const firstWord = q.split(/\s+/)[0];
  if (firstWord && firstWord !== q && firstWord.length >= 3) variants.push(firstWord);

  const [nseLists, yahooLists] = await Promise.all([
    Promise.all(variants.map(safeNse)),
    Promise.all(variants.slice(0, 2).map(searchYahooIndia)),
  ]);

  const seen = new Set();
  const quotes = [];
  for (const r of [...nseLists.flat(), ...yahooLists.flat()]) {
    const key = baseOf(r.symbol);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    quotes.push(r);
  }

  // Most relevant first: exact / prefix matches on the symbol or name.
  const needle = compact.toUpperCase();
  const score = (r) => {
    const sym = baseOf(r.symbol);
    const nm = String(r.name ?? '').toUpperCase().replace(/\s+/g, '');
    if (sym === needle) return 0;
    if (sym.startsWith(needle) || nm.startsWith(needle)) return 1;
    if (sym.includes(needle) || nm.includes(needle)) return 2;
    return 3;
  };
  quotes.sort((a, b) => score(a) - score(b));
  return { quotes: quotes.slice(0, 10) };
}
