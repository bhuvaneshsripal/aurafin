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

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
};

let cachedCookie = null;
let cookieFetchedAt = 0;
const COOKIE_TTL_MS = 4 * 60 * 1000; // NSE session cookies are short-lived; refresh every 4 min

async function getNseCookie() {
  if (cachedCookie && Date.now() - cookieFetchedAt < COOKIE_TTL_MS) return cachedCookie;

  const res = await fetch('https://www.nseindia.com/get-quotes/equity?symbol=RELIANCE', {
    headers: {
      ...BROWSER_HEADERS,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });

  const cookies =
    typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
  const cookie = cookies.map((c) => c.split(';')[0]).join('; ');

  // TEMP DIAGNOSTIC LOGGING — remove once live-price issue is confirmed/fixed.
  console.log(
    `[DIAG nse] cookie handshake: status=${res.status} setCookieCount=${cookies.length} gotCookie=${Boolean(cookie)}`
  );

  if (!cookie) throw new Error('NSE did not return a session cookie');

  cachedCookie = cookie;
  cookieFetchedAt = Date.now();
  return cookie;
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

  console.log(`[DIAG nse] quote-equity(${symbol}): status=${res.status}`);

  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE quote request failed: ${res.status}`);
  }

  const data = await res.json();
  const price = data?.priceInfo?.lastPrice;
  console.log(`[DIAG nse] quote-equity(${symbol}): lastPrice=${price}`);
  if (typeof price !== 'number' || !Number.isFinite(price)) {
    throw new Error('NSE quote response missing lastPrice');
  }
  return { price, currency: 'INR' };
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

  console.log(`[DIAG nse] autocomplete(${query}): status=${res.status}`);

  if (!res.ok) {
    invalidateNseCookie();
    throw new Error(`NSE search request failed: ${res.status}`);
  }

  const data = await res.json();
  const symbols = Array.isArray(data?.symbols) ? data.symbols : [];
  console.log(`[DIAG nse] autocomplete(${query}): symbolCount=${symbols.length}`);
  // Normalize to the same { quotes: [{ symbol, quoteType, exchDisp }] } shape
  // the frontend already expects from the old Yahoo search, so the client
  // doesn't need to know which upstream answered.
  return {
    quotes: symbols.map((s) => ({
      symbol: s.symbol,
      quoteType: 'EQUITY',
      exchDisp: 'NSE',
    })),
  };
}

export { fetchNseQuote, searchNseSymbol, invalidateNseCookie };
