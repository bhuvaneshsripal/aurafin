// Batch live-quote helper, shared by the Vercel function
// (api/market/chart/[symbol].js, served at /api/market/chart/_batch) and the
// Vite dev middleware, so local and production behave identically.
//
// Why this exists: the app used to ask for each holding's price with its own
// HTTP request every 5 seconds -- 60 stocks meant ~720 serverless calls a
// minute from one open tab, each with its own TLS/headers/JSON parse on the
// phone. One batched request replaces all of them.
//
// This lives in _lib (not as its own file under api/) on purpose: every file
// under api/ counts as a separate serverless function, and the project is
// already close to Vercel's Hobby-plan limit of 12.
import { resolveQuote } from './quote.js';

/** Most symbols answered by one call (keeps the function well inside its time limit). */
export const MAX_BATCH_SYMBOLS = 60;
/** Upstream lookups running at once. NSE throttles aggressive callers. */
const CONCURRENCY = 8;
/** Letters, digits and the punctuation real tickers use (M&M, BAJAJ-AUTO, BRK-B, ^GSPC, 500325.BO). */
const SYMBOL_RE = /^[A-Z0-9&._^=-]{1,30}$/;

/** "tcs, RELIANCE ,tcs" -> ["TCS", "RELIANCE"]. Drops junk, de-duplicates, caps the count. */
export function parseSymbols(raw) {
  const list = String(raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => SYMBOL_RE.test(s));
  return [...new Set(list)].slice(0, MAX_BATCH_SYMBOLS);
}

/**
 * Resolves many symbols with a small worker pool. Never throws: a symbol that
 * can't be priced is simply left out of the result.
 *
 * @param {string[]} symbols
 * @param {'IN'|'US'} market
 * @param {(symbol: string, market: string) => Promise<object|null>} [resolve] injectable for tests
 * @param {number} [concurrency]
 * @returns {Promise<Record<string, {price:number, previousClose?:number, currency?:string, source?:string}>>}
 */
export async function resolveQuotes(symbols, market = 'IN', resolve = resolveQuote, concurrency = CONCURRENCY) {
  const quotes = {};
  let next = 0;
  const worker = async () => {
    while (next < symbols.length) {
      const symbol = symbols[next++];
      try {
        const q = await resolve(symbol, market);
        if (q && Number.isFinite(q.price) && q.price > 0) {
          quotes[symbol] = {
            price: q.price,
            previousClose: q.previousClose,
            currency: q.currency,
            source: q.source,
          };
        }
      } catch {
        /* this symbol just has no price this round */
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, symbols.length) }, worker));
  return quotes;
}
