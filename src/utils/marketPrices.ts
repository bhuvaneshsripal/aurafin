/**
 * Live equity quote endpoint. Tries NSE India's own API first, falls
 * back to Yahoo Finance automatically if NSE is unavailable — see
 * api/market/chart/[symbol].js. Proxied in dev via vite.config.ts.
 */
const QUOTE_BASE = '/api/market/chart';
/**
 * Symbol-search endpoint (NSE autocomplete, with a Yahoo fallback) —
 * see api/market/v1/finance/search.js. Proxied in dev via vite.config.ts.
 */
const SEARCH_BASE = '/api/market/v1/finance/search';

export interface LiveQuote {
  symbol: string;
  price: number;
  currency: string;
}

/** Something we need a live price for, identified however the import gave it to us. */
export interface PriceLookup {
  /** The key the result should be stored under (usually asset.symbol, uppercased). */
  key: string;
  /** ISIN, if known — the most reliable way to resolve a real ticker. */
  isin?: string;
  /** Full name, used as a last-resort search query if there's no ISIN. */
  name?: string;
}

/**
 * Normalize a broker symbol to a bare uppercase ticker. NSE's API takes
 * plain symbols (no exchange suffix); the server adds .NS itself if it
 * needs to fall back to Yahoo, so the client doesn't need to guess it.
 */
export function toYahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, '').replace(/\.(NS|BO)$/i, '');
}

/**
 * A real NSE/BSE trading symbol never contains whitespace (e.g. RELIANCE,
 * M&M, TATASTEEL). Some import sources (Groww) give the full company name
 * instead (e.g. "ADANI TOTAL GAS LIMITED"), which can't be turned into a
 * Yahoo ticker directly and needs a symbol-search lookup instead.
 */
export function looksLikeTicker(symbol: string): boolean {
  const trimmed = symbol.trim();
  return trimmed.length > 0 && !/\s/.test(trimmed);
}

// In-memory cache from ISIN/name -> resolved Yahoo symbol, so we only hit
// the search endpoint once per session instead of on every 60s poll.
const resolvedSymbolCache = new Map<string, string | null>();

/** Resolve a real Yahoo/NSE ticker from an ISIN or company name via symbol search. */
async function searchYahooSymbol(query: string): Promise<string | null> {
  const cacheKey = query.trim().toUpperCase();
  if (resolvedSymbolCache.has(cacheKey)) {
    const cached = resolvedSymbolCache.get(cacheKey) ?? null;
    console.log(`[DIAG client] searchYahooSymbol(${query}): CACHE HIT -> ${cached}`);
    return cached;
  }

  let resolved: string | null = null;
  try {
    const res = await fetch(`${SEARCH_BASE}?q=${encodeURIComponent(query)}`);
    console.log(`[DIAG client] searchYahooSymbol(${query}): fetch status=${res.status} ok=${res.ok}`);
    if (res.ok) {
      const json = await res.json();
      const quotes: { symbol?: string; quoteType?: string; exchDisp?: string }[] =
        json?.quotes ?? [];
      console.log(`[DIAG client] searchYahooSymbol(${query}): raw quotes=`, JSON.stringify(quotes));
      const equities = quotes.filter(
        (q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === undefined)
      );
      // Prefer NSE (.NS) over BSE (.BO) over anything else.
      const nse = equities.find((q) => q.symbol?.endsWith('.NS'));
      const bse = equities.find((q) => q.symbol?.endsWith('.BO'));
      resolved = (nse ?? bse ?? equities[0])?.symbol ?? null;
    }
  } catch (err) {
    console.log(`[DIAG client] searchYahooSymbol(${query}): threw`, err);
    resolved = null;
  }

  console.log(`[DIAG client] searchYahooSymbol(${query}): resolved -> ${resolved}`);
  resolvedSymbolCache.set(cacheKey, resolved);
  return resolved;
}

async function fetchQuote(symbol: string): Promise<{ price: number } | null> {
  console.log(`[DIAG client] fetchQuote(${symbol}): calling ${QUOTE_BASE}/${symbol}`);
  try {
    const res = await fetch(`${QUOTE_BASE}/${encodeURIComponent(symbol)}`);
    console.log(`[DIAG client] fetchQuote(${symbol}): status=${res.status} ok=${res.ok}`);
    if (!res.ok) return null;

    const json = await res.json();
    const price = json?.price;
    console.log(`[DIAG client] fetchQuote(${symbol}): price=${price}`);
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;

    return { price };
  } catch (err) {
    console.log(`[DIAG client] fetchQuote(${symbol}): threw`, err);
    return null;
  }
}

/**
 * Fetch live prices for a batch of holdings. Each lookup is keyed by
 * whatever identifier the caller wants the result stored under (usually
 * asset.symbol). If that identifier isn't a real trading symbol (e.g. a
 * Groww export gave a full company name), we resolve the actual ticker
 * first via ISIN, then via name, before fetching the quote.
 */
export async function fetchLivePrices(lookups: PriceLookup[]): Promise<Map<string, number>> {
  const results = new Map<string, number>();

  // Dedupe by key so we don't fetch the same holding twice.
  const unique = new Map<string, PriceLookup>();
  for (const l of lookups) {
    const key = l.key.trim().toUpperCase();
    if (key) unique.set(key, { ...l, key });
  }

  const entries = [...unique.values()];

  // Yahoo has no batch endpoint — fetch in small parallel groups.
  const batchSize = 5;
  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (lookup) => {
        let yahooSymbol: string | null = null;

        if (looksLikeTicker(lookup.key)) {
          yahooSymbol = toYahooSymbol(lookup.key);
          console.log(`[DIAG client] ${lookup.key}: looks like ticker -> ${yahooSymbol}`);
        } else if (lookup.isin) {
          yahooSymbol = await searchYahooSymbol(lookup.isin);
          if (!yahooSymbol && lookup.name) yahooSymbol = await searchYahooSymbol(lookup.name);
        } else if (lookup.name) {
          yahooSymbol = await searchYahooSymbol(lookup.name);
        }

        if (!yahooSymbol) {
          console.log(`[DIAG client] ${lookup.key}: NO yahooSymbol resolved, skipping fetchQuote`);
          return;
        }
        const quote = await fetchQuote(yahooSymbol);
        if (quote) results.set(lookup.key, quote.price);
      })
    );
  }

  return results;
}