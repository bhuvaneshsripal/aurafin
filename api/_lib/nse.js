// Shared helper for talking to NSE India's unofficial JSON API
// (www.nseindia.com/api/...). NSE requires a real browser-looking
// session: you first GET a normal page to receive session cookies,
// then send those cookies + browser-like headers on the actual API
// call, or NSE responds with 401/403.
//
// Cookies are cached at module scope so warm serverless invocations
// reuse them instead of doing the handshake on every request. Vercel
// keeps a function instance warm for a while between calls, so this
// meaningfully cuts down on handshake round trips.
import { fetch } from './fetchTimeout.js';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

let cachedCookie = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 4 * 60 * 1000; // NSE session cookies are short-lived; refresh every 4 min

// One handshake at a time: when several quotes are requested together on a cold
// instance (a batch of holdings), they all wait for the same cookie instead of
// each opening its own session with NSE (which is slow and gets throttled).
let cookieInFlight = null;

async function getNseCookie() {
  if (cachedCookie && Date.now() - cookieFetchedAt < COOKIE_TTL_MS) return cachedCookie;
  if (cookieInFlight) return cookieInFlight;

  cookieInFlight = (async () => {
    const res = await fetch('https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE', {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    const cookies =
      typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    const cookie = cookies.map((c) => c.split(';')[0]).join('; ');

    if (!cookie) throw new Error('NSE did not return a session cookie');

    cachedCookie = cookie;
    cookieFetchedAt = Date.now();
    return cookie;
  })().finally(() => {
    cookieInFlight = null;
  });
  return cookieInFlight;
}

/** Invalidate the cached cookie — call this after a failed request so the next call re-handshakes. */
function invalidateNseCookie() {
  cachedCookie = null;
}

/** Fetch a live quote for an NSE-listed equity, e.g. "RELIANCE", "TCS". */
async function fetchNseQuote(symbol) {
  const cookie = await getNseCookie();
  const res = await fetch(
    `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
    {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'application/json',
        Referer: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
        Cookie: cookie,
      },
    }
  );

  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE quote request failed: ${res.status}`);
  }

  const data = await res.json();
  // Never accept another company's quote for this symbol.
  const answered = data?.info?.symbol;
  if (typeof answered === 'string' && answered.toUpperCase() !== String(symbol).toUpperCase()) {
    throw new Error('NSE quote response was for a different symbol');
  }
  const price = data?.priceInfo?.lastPrice;
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('NSE quote response missing lastPrice');
  }
  const previousClose = data?.priceInfo?.previousClose;
  // "08-Nov-2026 15:20:00" (IST): when NSE last updated this quote.
  const stamp = String(data?.metadata?.lastUpdateTime ?? data?.priceInfo?.lastUpdateTime ?? '');
  const m = stamp.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})\s+(\d{1,2}):(\d{2}):?(\d{2})?/);
  const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const asOf = m
    ? Date.UTC(+m[3], MONTHS.indexOf(m[2].toLowerCase()), +m[1], +m[4], +m[5], +(m[6] ?? 0)) - 5.5 * 3600 * 1000
    : undefined;
  return {
    price,
    asOf: Number.isFinite(asOf) ? asOf : undefined,
    currency: 'INR',
    previousClose: typeof previousClose === 'number' && Number.isFinite(previousClose) ? previousClose : undefined,
  };
}

/** ISIN for an NSE-listed equity (used to look up its Groww logo). */
async function fetchNseIsin(symbol) {
  const cookie = await getNseCookie();
  const res = await fetch(
    `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`,
    {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'application/json',
        Referer: `https://www.nseindia.com/get-quotes/equity?symbol=${encodeURIComponent(symbol)}`,
        Cookie: cookie,
      },
    }
  );
  if (!res.ok) {
    invalidateNseCookie();
    return null;
  }
  const isin = (await res.json())?.info?.isin;
  return typeof isin === 'string' && /^[A-Z]{2}[A-Z0-9]{9}\d$/.test(isin) ? isin : null;
}

/** Search NSE's autocomplete for a symbol matching an ISIN or company name. */
async function searchNseSymbol(query) {
  const cookie = await getNseCookie();
  const res = await fetch(
    `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(query)}`,
    {
      headers: {
        ...BROWSER_HEADERS,
        Accept: 'application/json',
        Referer: 'https://www.nseindia.com/',
        Cookie: cookie,
      },
    }
  );

  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE search request failed: ${res.status}`);
  }

  const data = await res.json();
  const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
  // Normalize to the same { quotes: [{ symbol, quoteType, exchDisp }] } shape
  // the frontend already expects from the old Yahoo search, so the client
  // doesn't need to know which upstream answered.
  return {
    quotes: symbols
      // Autocomplete also returns indices/derivatives; keep tradable equities/ETFs.
      .filter((s) => s?.symbol && (!s.result_type || s.result_type === 'symbol') && (!s.result_sub_type || /equity|etf|sme/i.test(s.result_sub_type)))
      .map((s) => ({
        symbol: s.symbol,
        name: s.symbol_info || s.symbol,
        quoteType: 'EQUITY',
        exchDisp: 'NSE',
      })),
  };
}

/** Every NSE index in one call: [{ index: 'NIFTY 50', last, previousClose, ... }]. */
async function fetchNseAllIndices() {
  const cookie = await getNseCookie();
  const res = await fetch('https://www.nseindia.com/api/allIndices', {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'application/json',
      Referer: 'https://www.nseindia.com/market-data/live-market-indices',
      Cookie: cookie,
    },
  });
  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE allIndices request failed: ${res.status}`);
  }
  const data = await res.json();
  return Array.isArray(data?.data) ? data.data : [];
}

/** NSE's live "most active by volume" and "volume gainers" tables (unofficial JSON). */
async function fetchNseJson(path, referer, timeoutMs) {
  const cookie = await getNseCookie();
  const res = await fetch(`https://www.nseindia.com/api/${path}`, {
    headers: { ...BROWSER_HEADERS, Accept: 'application/json', Referer: referer, Cookie: cookie },
    // Big tables (a whole index) need longer than the default 8 s on a cold session.
    ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
  });
  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE ${path} request failed: ${res.status}`);
  }
  return res.json();
}

/** Plain-text download of a filing NSE links to (e.g. a shareholding XBRL). Only NSE's own hosts. */
async function fetchNseText(url, referer = 'https://www.nseindia.com/') {
  const host = new URL(url).hostname;
  if (host !== 'nsearchives.nseindia.com' && host !== 'www.nseindia.com') throw new Error('Not an NSE host');
  const cookie = await getNseCookie();
  const res = await fetch(url, {
    headers: { ...BROWSER_HEADERS, Accept: 'application/xml,text/xml,*/*', Referer: referer, Cookie: cookie },
  });
  if (!res.ok) throw new Error(`NSE file request failed: ${res.status}`);
  return res.text();
}

async function fetchNseMostActiveByVolume() {
  const data = await fetchNseJson(
    'live-analysis-most-active-securities?index=volume',
    'https://www.nseindia.com/market-data/most-active-equities'
  );
  return Array.isArray(data?.data) ? data.data : [];
}

async function fetchNseVolumeGainers() {
  const data = await fetchNseJson(
    'live-analysis-volume-gainers',
    'https://www.nseindia.com/market-data/volume-gainers-spurts'
  );
  return Array.isArray(data?.data) ? data.data : [];
}

/** Constituents of an NSE index, e.g. "NIFTY 200": [{ symbol, meta: { companyName }, ... }]. */
async function fetchNseIndexConstituents(indexName) {
  const data = await fetchNseJson(
    `equity-stockIndices?index=${encodeURIComponent(indexName)}`,
    'https://www.nseindia.com/market-data/live-equity-market',
    10_000
  );
  return Array.isArray(data?.data) ? data.data : [];
}

export { fetchNseIndexConstituents, fetchNseMostActiveByVolume, fetchNseVolumeGainers, fetchNseIsin, fetchNseQuote, searchNseSymbol, invalidateNseCookie, fetchNseAllIndices, fetchNseJson, fetchNseText };
