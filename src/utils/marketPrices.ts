/** Yahoo Finance chart endpoint — proxied in dev via vite.config.ts */
const QUOTE_BASE = '/api/market/chart';

export interface LiveQuote {
  symbol: string;
  price: number;
  currency: string;
}

/** Normalize a broker symbol to Yahoo Finance NSE ticker. */
export function toYahooSymbol(symbol: string): string {
  const clean = symbol.trim().toUpperCase().replace(/\s+/g, '');
  if (clean.endsWith('.NS') || clean.endsWith('.BO')) return clean;
  return `${clean}.NS`;
}

async function fetchQuote(yahooSymbol: string): Promise<LiveQuote | null> {
  try {
    const res = await fetch(
      `${QUOTE_BASE}/${encodeURIComponent(yahooSymbol)}?interval=1d&range=1d`
    );
    if (!res.ok) return null;

    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice ?? meta?.previousClose;
    if (typeof price !== 'number' || !Number.isFinite(price)) return null;

    const rawSymbol = yahooSymbol.replace(/\.(NS|BO)$/, '');
    return {
      symbol: rawSymbol,
      price,
      currency: meta?.currency ?? 'INR',
    };
  } catch {
    return null;
  }
}

/** Fetch live prices for multiple NSE symbols (batched, deduplicated). */
export async function fetchLivePrices(symbols: string[]): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter(Boolean))];
  const results = new Map<string, number>();

  // Yahoo has no batch endpoint — fetch in small parallel groups.
  const batchSize = 5;
  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const quotes = await Promise.all(batch.map((s) => fetchQuote(toYahooSymbol(s))));
    quotes.forEach((q) => {
      if (q) results.set(q.symbol, q.price);
    });
  }

  return results;
}
