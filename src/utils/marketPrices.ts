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
  /**
   * Which market this ticker trades on. Defaults to 'IN' (NSE, falling
   * back to BSE/Yahoo). 'US' skips the NSE attempt entirely and queries
   * the US market directly — an NSE lookup for "AAPL" would just fail
   * (or worse, silently match an unrelated NSE symbol).
   */
  market?: 'IN' | 'US';
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

/** A single symbol-search suggestion, shown in the "type 3 letters" autocomplete. */
export interface StockSearchResult {
  symbol: string;
  /** Company name, when the upstream provides one (Yahoo does; NSE's autocomplete doesn't, so it falls back to the symbol). */
  name: string;
  /** Display exchange, e.g. "NSE", "NasdaqGS". */
  exchDisp?: string;
}

/**
 * Search for real trading symbols matching a (possibly misspelled or
 * partial) company name — powers the Symbol field's autocomplete so
 * people don't have to already know the correct ticker ("GOOGLE" ->
 * suggests GOOGL/GOOG). Returns `[]` for a genuine no-match, or `null`
 * if the request itself failed, so callers can tell those apart.
 */
export async function searchStockSymbols(
  query: string,
  market: 'IN' | 'US' = 'IN'
): Promise<StockSearchResult[] | null> {
  const q = query.trim();
  if (q.length < 3) return [];
  try {
    const res = await fetch(`${SEARCH_BASE}?q=${encodeURIComponent(q)}&market=${market}`);
    if (!res.ok) return null;
    const json = await res.json();
    const quotes: { symbol?: string; name?: string; exchDisp?: string }[] = json?.quotes ?? [];
    return quotes
      .filter((r): r is { symbol: string; name: string; exchDisp?: string } => !!r.symbol)
      .slice(0, 8)
      .map((r) => ({ symbol: r.symbol, name: r.name || r.symbol, exchDisp: r.exchDisp }));
  } catch {
    return null;
  }
}

// In-memory cache from ISIN/name -> resolved Yahoo symbol, so we only hit
// the search endpoint once per session instead of on every 60s poll.
const resolvedSymbolCache = new Map<string, string | null>();

/** Resolve a real Yahoo/NSE ticker from an ISIN or company name via symbol search. */
async function searchYahooSymbol(query: string): Promise<string | null> {
  const cacheKey = query.trim().toUpperCase();
  if (resolvedSymbolCache.has(cacheKey)) return resolvedSymbolCache.get(cacheKey) ?? null;

  let resolved: string | null = null;
  try {
    const res = await fetch(`${SEARCH_BASE}?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const json = await res.json();
      const quotes: { symbol?: string; quoteType?: string; exchDisp?: string }[] =
        json?.quotes ?? [];
      const equities = quotes.filter(
        (q) => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === undefined)
      );
      // Prefer NSE (.NS) over BSE (.BO) over anything else.
      const nse = equities.find((q) => q.symbol?.endsWith('.NS'));
      const bse = equities.find((q) => q.symbol?.endsWith('.BO'));
      resolved = (nse ?? bse ?? equities[0])?.symbol ?? null;
    }
  } catch {
    resolved = null;
  }

  resolvedSymbolCache.set(cacheKey, resolved);
  return resolved;
}

async function fetchQuote(symbol: string, market: 'IN' | 'US' = 'IN'): Promise<{ price: number } | null> {
  try {
    const res = await fetch(
      `${QUOTE_BASE}/${encodeURIComponent(symbol)}?market=${market}`
    );
    if (!res.ok) return null;

    const json = await res.json();
    const price = json?.price;
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;

    return { price };
  } catch {
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
        const market = lookup.market ?? 'IN';

        if (looksLikeTicker(lookup.key)) {
          yahooSymbol = toYahooSymbol(lookup.key);
        } else if (lookup.isin) {
          yahooSymbol = await searchYahooSymbol(lookup.isin);
          if (!yahooSymbol && lookup.name) yahooSymbol = await searchYahooSymbol(lookup.name);
        } else if (lookup.name) {
          yahooSymbol = await searchYahooSymbol(lookup.name);
        }

        if (!yahooSymbol) return;
        const quote = await fetchQuote(yahooSymbol, market);
        if (quote) results.set(lookup.key, quote.price);
      })
    );
  }

  return results;
}

/** Backed by api/market/fx.js (frankfurter.dev — free, keyless, updated daily). */
const FX_BASE = '/api/market/fx';

// Cached at module scope (not per-component) and shared across the whole
// session — an exchange rate barely moves minute to minute, so there's no
// need to re-fetch it every time a purchase row's amount changes.
const FX_CACHE_MS = 5 * 60 * 1000;
const fxCache = new Map<string, { rate: number; fetchedAt: number }>();

/**
 * Live exchange rate: how much 1 unit of `from` is worth in `to`
 * (e.g. fetchFxRate('INR', 'USD') ≈ 0.012). Returns `null` if the rate
 * couldn't be fetched, so callers can fall back to leaving the amount
 * unconverted rather than silently using a wrong rate.
 */
export async function fetchFxRate(from: string, to: string): Promise<number | null> {
  if (from === to) return 1;
  const pair = `${from}_${to}`;
  const cached = fxCache.get(pair);
  if (cached && Date.now() - cached.fetchedAt < FX_CACHE_MS) return cached.rate;

  try {
    const res = await fetch(`${FX_BASE}?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    if (!res.ok) return null;
    const json = await res.json();
    const rate = json?.rate;
    if (typeof rate !== 'number' || !Number.isFinite(rate)) return null;
    fxCache.set(pair, { rate, fetchedAt: Date.now() });
    return rate;
  } catch {
    return null;
  }
}
