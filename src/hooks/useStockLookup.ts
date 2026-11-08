import { useEffect, useRef, useState } from 'react';

/**
 * Lets a list page's search box reach beyond the list: when the typed text matches NSE stocks that
 * are not already in `known`, each one is looked up with `lookupUrl` and returned as an extra row.
 */
const cache = new Map<string, unknown | null>();

interface SearchQuote {
  symbol?: string;
  name?: string;
}

export function useStockLookup<T extends { symbol: string }>(
  query: string,
  known: Set<string>,
  lookupUrl: (symbol: string, name: string) => string,
  scope: string
): { extras: T[]; searching: boolean } {
  const [extras, setExtras] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);
  const knownRef = useRef(known);
  knownRef.current = known;
  const urlRef = useRef(lookupUrl);
  urlRef.current = lookupUrl;

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setExtras([]);
      setSearching(false);
      return;
    }
    const ctrl = new AbortController();
    setSearching(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/market/v1/finance/search?q=${encodeURIComponent(q)}&market=IN`, {
          signal: ctrl.signal,
        });
        const json = await res.json();
        const quotes: SearchQuote[] = Array.isArray(json?.quotes) ? json.quotes : [];
        const seen = new Set<string>();
        const picks: { symbol: string; name: string }[] = [];
        for (const r of quotes) {
          const raw = String(r.symbol ?? '').toUpperCase();
          if (!raw || raw.endsWith('.BO')) continue; // BSE-only listings have no NSE data here
          const symbol = raw.replace(/\.NS$/, '');
          if (seen.has(symbol) || knownRef.current.has(symbol)) continue;
          seen.add(symbol);
          picks.push({ symbol, name: r.name ?? symbol });
          if (picks.length >= 5) break;
        }
        const found: (T | null)[] = await Promise.all(
          picks.map(async ({ symbol, name }): Promise<T | null> => {
            const key = `${scope}:${symbol}`;
            if (cache.has(key)) return (cache.get(key) ?? null) as T | null;
            try {
              const r = await fetch(urlRef.current(symbol, name), { signal: ctrl.signal });
              if (!r.ok) return null; // not cached: it may work next time
              const stock = (await r.json())?.stock as T | undefined;
              const val: T | null = stock && stock.symbol ? stock : null;
              if (val) cache.set(key, val);
              return val;
            } catch {
              return null;
            }
          })
        );
        if (!ctrl.signal.aborted) setExtras(found.filter((x) => x !== null) as T[]);
      } catch {
        if (!ctrl.signal.aborted) setExtras([]);
      } finally {
        if (!ctrl.signal.aborted) setSearching(false);
      }
    }, 400);
    return () => {
      window.clearTimeout(t);
      ctrl.abort();
    };
  }, [query, scope]);

  return { extras, searching };
}
