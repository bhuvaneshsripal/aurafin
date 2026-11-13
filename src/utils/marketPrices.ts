import { fetchWithTimeout } from './fetchWithTimeout';

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

/** Richer quote used by the Holdings widget — same price lookup, plus
 *  yesterday's close so 1D change (₹ and %) can be computed client-side. */
export interface LiveQuoteDetail {
  price: number;
  previousClose?: number;
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
 * Normalize a broker symbol to an uppercase ticker. NSE's API takes plain
 * symbols, so a ".NS" suffix is dropped (the server adds it again if it needs
 * Yahoo). A ".BO" suffix is KEPT: it tells the server this is a BSE listing and
 * to skip NSE — dropping it priced BSE stocks from NSE (or matched an unrelated
 * NSE symbol, e.g. "NSE.BO" -> "NSE").
 */
export function toYahooSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/\s+/g, '').replace(/\.NS$/i, '');
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
// Remembered results per (market, text): repeating or re-typing a search is instant,
// and two callers asking at once share one request. Failures are never cached.
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map<string, { at: number; value: StockSearchResult[] }>();
const searchInflight = new Map<string, Promise<StockSearchResult[] | null>>();

export function searchStockSymbols(
  query: string,
  market: 'IN' | 'US' = 'IN'
): Promise<StockSearchResult[] | null> {
  const q = query.trim();
  if (q.length < 3) return Promise.resolve([]);
  const key = `${market}:${q.toLowerCase()}`;
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_CACHE_TTL_MS) return Promise.resolve(hit.value);
  const running = searchInflight.get(key);
  if (running) return running;
  const p = (async () => {
    try {
      const res = await fetch(`${SEARCH_BASE}?q=${encodeURIComponent(q)}&market=${market}`);
      if (!res.ok) return null;
      const json = await res.json();
      const quotes: { symbol?: string; name?: string; exchDisp?: string }[] = json?.quotes ?? [];
      const value = quotes
        .filter((r): r is { symbol: string; name: string; exchDisp?: string } => !!r.symbol)
        .slice(0, 8)
        .map((r) => ({ symbol: r.symbol, name: r.name || r.symbol, exchDisp: r.exchDisp }));
      searchCache.set(key, { at: Date.now(), value });
      return value;
    } catch {
      return null;
    } finally {
      searchInflight.delete(key);
    }
  })();
  searchInflight.set(key, p);
  return p;
}

// In-memory cache from ISIN/name -> resolved Yahoo symbol, so we don't hit the
// search endpoint on every 5s poll. A found symbol is kept for a while; a
// miss (search failed or found nothing) is only remembered briefly so one bad
// moment never leaves a holding without a price (or with the wrong one) for
// the rest of the session — that used to need a page refresh to clear.
const SYMBOL_HIT_TTL_MS = 30 * 60 * 1000;
const SYMBOL_MISS_TTL_MS = 20 * 1000;
const resolvedSymbolCache = new Map<string, { symbol: string | null; at: number }>();

/** Drop a remembered ISIN/name -> symbol match so the next poll searches again. */
export function forgetResolvedSymbol(query: string | undefined): void {
  if (query) resolvedSymbolCache.delete(query.trim().toUpperCase());
}

const NAME_FILLER = new Set(['LIMITED', 'LTD', 'INDIA', 'THE', 'AND', 'CO', 'COMPANY', 'CORP', 'CORPORATION', 'PVT', 'PRIVATE', 'INC', 'OF']);
const nameTokens = (name: string) =>
  name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t && !NAME_FILLER.has(t));

/** True when a search hit really is the company we asked for (by name), so
 *  "JIO PLATFORMS" can't be priced as some other "JIO…" share. */
function nameMatches(wanted: string, symbol: string, name?: string): boolean {
  const tokens = nameTokens(wanted);
  if (tokens.length === 0) return true;
  const hay = `${name ?? ''} ${symbol.replace(/\.(NS|BO)$/i, '')}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hits = tokens.filter((t) => hay.includes(t)).length;
  return hits >= Math.max(1, Math.ceil(tokens.length * 0.75));
}

/** Resolve a real Yahoo/NSE ticker from an ISIN or company name via symbol search.
 *  `byName` makes it insist the result's name actually matches. */
async function searchYahooSymbol(query: string, byName = false): Promise<string | null> {
  const cacheKey = query.trim().toUpperCase();
  const cached = resolvedSymbolCache.get(cacheKey);
  if (cached && Date.now() - cached.at < (cached.symbol ? SYMBOL_HIT_TTL_MS : SYMBOL_MISS_TTL_MS)) {
    return cached.symbol;
  }

  let resolved: string | null = null;
  try {
    const res = await fetchWithTimeout(`${SEARCH_BASE}?q=${encodeURIComponent(query)}`);
    if (res.ok) {
      const json = await res.json();
      const quotes: { symbol?: string; name?: string; quoteType?: string; exchDisp?: string }[] =
        json?.quotes ?? [];
      const equities = quotes.filter(
        (q) =>
          q.symbol &&
          (q.quoteType === 'EQUITY' || q.quoteType === undefined) &&
          (!byName || nameMatches(query, q.symbol, q.name))
      );
      // Prefer NSE (.NS) over BSE (.BO) over anything else.
      const nse = equities.find((q) => q.symbol?.endsWith('.NS'));
      const bse = equities.find((q) => q.symbol?.endsWith('.BO'));
      resolved = (nse ?? bse ?? equities[0])?.symbol ?? null;
    }
  } catch {
    resolved = null;
  }

  resolvedSymbolCache.set(cacheKey, { symbol: resolved, at: Date.now() });
  return resolved;
}

async function fetchQuote(symbol: string, market: 'IN' | 'US' = 'IN'): Promise<LiveQuoteDetail | null> {
  // One quick retry: a single dropped/slow request must not leave this
  // holding without a live price (it would fall back to its old saved value).
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetchWithTimeout(`${QUOTE_BASE}/${encodeURIComponent(symbol)}?market=${market}`);
      if (!res.ok) continue;
      const quote = parseQuote(await res.json());
      if (quote) return quote;
    } catch {
      /* timeout / network error → retry once */
    }
  }
  return null;
}

/** Reads one quote out of a server response, rejecting anything that isn't a sane positive price. */
function parseQuote(json: unknown): LiveQuoteDetail | null {
  const q = json as { price?: unknown; previousClose?: unknown } | null | undefined;
  const price = q?.price;
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null;
  const previousClose = q?.previousClose;
  return {
    price,
    previousClose: typeof previousClose === 'number' && Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

/** Most symbols sent in one batch request (the server caps a call at 60). */
const BATCH_CHUNK = 40;
/** All devices fetch on the same wall-clock grid. The bucket number is part of the
 *  request URL, so the server/CDN hands every device in the same window the very
 *  same cached answer -- two phones can no longer show different prices. */
export const PRICE_BUCKET_MS = 1_000;
export const priceBucket = (now: number = Date.now()) => Math.floor(now / PRICE_BUCKET_MS);
/** After a batch, symbols it didn't price are retried one by one -- but only a few,
 *  so a provider outage can't turn one poll into dozens of requests again. */
const MAX_SINGLE_RETRIES = 4;

/**
 * Prices many symbols in ONE request (api/market/chart/_batch). Returns `null`
 * when the request itself failed, so the caller can fall back to per-symbol
 * requests; an empty map means "the server answered but priced nothing".
 */
async function fetchQuoteBatch(symbols: string[], market: 'IN' | 'US'): Promise<Map<string, LiveQuoteDetail> | null> {
  try {
    const res = await fetchWithTimeout(
      `${QUOTE_BASE}/_batch?market=${market}&b=${priceBucket()}&symbols=${encodeURIComponent([...symbols].sort().join(','))}`,
      12000
    );
    if (!res.ok) return null;
    const json = await res.json();
    const raw = json?.quotes;
    if (!raw || typeof raw !== 'object') return null;
    const out = new Map<string, LiveQuoteDetail>();
    for (const sym of symbols) {
      const q = parseQuote(raw[sym]);
      if (q) out.set(sym, q);
    }
    return out;
  } catch {
    return null;
  }
}

/** Runs `fn` over `items` with at most `limit` in flight (keeps a burst of name lookups polite). */
async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) await fn(items[next++]);
    })
  );
}

/**
 * Fetch live quotes (price + previous close) for a batch of holdings. Same
 * lookup/resolution logic as `fetchLivePrices` below, just returning the
 * richer per-symbol detail that a 1D-change figure needs instead of only
 * the price.
 *
 * Prices come from ONE batched request per market (per 40 symbols) instead of
 * one request per holding -- with 60 stocks refreshed every 5 s that is 1
 * request instead of 60, which is what keeps the page responsive.
 */
export async function fetchLiveQuotes(lookups: PriceLookup[]): Promise<Map<string, LiveQuoteDetail>> {
  const results = new Map<string, LiveQuoteDetail>();

  // Dedupe by key so we don't fetch the same holding twice.
  const unique = new Map<string, PriceLookup>();
  for (const l of lookups) {
    const key = l.key.trim().toUpperCase();
    if (key) unique.set(key, { ...l, key });
  }
  const entries = [...unique.values()];

  // 1. Work out the real ticker for every holding (cheap for plain tickers;
  //    ISIN / company-name holdings use the cached symbol search).
  const resolved: { key: string; symbol: string; market: 'IN' | 'US' }[] = [];
  await mapPool(entries, 6, async (lookup) => {
    let yahooSymbol: string | null = null;
    if (looksLikeTicker(lookup.key)) {
      yahooSymbol = toYahooSymbol(lookup.key);
    } else if (lookup.isin) {
      yahooSymbol = await searchYahooSymbol(lookup.isin);
      if (!yahooSymbol && lookup.name) yahooSymbol = await searchYahooSymbol(lookup.name, true);
    } else if (lookup.name) {
      yahooSymbol = await searchYahooSymbol(lookup.name, true);
    }
    if (yahooSymbol) resolved.push({ key: lookup.key, symbol: yahooSymbol.trim().toUpperCase(), market: lookup.market ?? 'IN' });
  });
  if (resolved.length === 0) return results;

  // 2. Group by market -> unique symbols -> chunks of BATCH_CHUNK.
  const byMarket = new Map<'IN' | 'US', Set<string>>();
  for (const r of resolved) {
    if (!byMarket.has(r.market)) byMarket.set(r.market, new Set());
    byMarket.get(r.market)!.add(r.symbol);
  }
  const bySymbol = new Map<string, LiveQuoteDetail>(); // "IN:TCS" -> quote
  const missing: { symbol: string; market: 'IN' | 'US' }[] = [];

  await Promise.all(
    [...byMarket.entries()].flatMap(([market, set]) => {
      const symbols = [...set].sort();
      const chunks: string[][] = [];
      for (let i = 0; i < symbols.length; i += BATCH_CHUNK) chunks.push(symbols.slice(i, i + BATCH_CHUNK));
      return chunks.map(async (chunk) => {
        const got = await fetchQuoteBatch(chunk, market);
        if (got === null) {
          // The batch call itself failed (old deploy without the endpoint, flaky
          // network): fall back to the original one-request-per-symbol path.
          await mapPool(chunk, 10, async (symbol) => {
            const q = await fetchQuote(symbol, market);
            if (q) bySymbol.set(`${market}:${symbol}`, q);
          });
          return;
        }
        for (const symbol of chunk) {
          const q = got.get(symbol);
          if (q) bySymbol.set(`${market}:${symbol}`, q);
          else missing.push({ symbol, market });
        }
      });
    })
  );

  // 3. A few symbols the batch couldn't price get one individual retry (a single
  //    dropped upstream lookup must not leave that holding on a stale price).
  await mapPool(missing.slice(0, MAX_SINGLE_RETRIES), MAX_SINGLE_RETRIES, async ({ symbol, market }) => {
    const q = await fetchQuote(symbol, market);
    if (q) bySymbol.set(`${market}:${symbol}`, q);
  });

  for (const r of resolved) {
    const q = bySymbol.get(`${r.market}:${r.symbol}`);
    if (q) results.set(r.key, q);
  }
  return results;
}

/**
 * Fetch live prices for a batch of holdings. Each lookup is keyed by
 * whatever identifier the caller wants the result stored under (usually
 * asset.symbol). If that identifier isn't a real trading symbol (e.g. a
 * Groww export gave a full company name), we resolve the actual ticker
 * first via ISIN, then via name, before fetching the quote.
 *
 * Thin wrapper around `fetchLiveQuotes` for callers that only need the
 * price itself (e.g. the Add Asset form's live-price preview).
 */
export async function fetchLivePrices(lookups: PriceLookup[]): Promise<Map<string, number>> {
  const quotes = await fetchLiveQuotes(lookups);
  const results = new Map<string, number>();
  quotes.forEach((q, key) => results.set(key, q.price));
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
