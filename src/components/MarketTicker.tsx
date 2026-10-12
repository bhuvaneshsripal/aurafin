import { useEffect, useState } from 'react';
import { cn } from './ui/cn';
import { isMarketOpen } from '../utils/marketHours';

interface IndexQuote {
  key: string;
  name: string;
  price: number;
  previousClose?: number;
}

const LIVE_MS = 1_000; // market open: refresh every second
const IDLE_MS = 30_000; // market closed: nothing moves, so poll lazily


const ORDER = [
  { key: 'nifty', name: 'NIFTY' },
  { key: 'sensex', name: 'SENSEX' },
  { key: 'banknifty', name: 'BANKNIFTY' },
];

async function loadIndices(): Promise<IndexQuote[] | null> {
  try {
    const res = await fetch('/api/market/indices');
    if (!res.ok) return null;
    const json = await res.json();
    return Array.isArray(json?.indices) ? json.indices : null;
  } catch {
    return null;
  }
}

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** One-line index strip: NAME  level  ±change (±pct%). Polled every second
 *  during market hours (30s otherwise) while the tab is visible. */
export default function MarketTicker() {
  const [quotes, setQuotes] = useState<IndexQuote[] | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    // Chained timeouts (not setInterval) so a slow response never overlaps the next request.
    const tick = async () => {
      if (document.visibilityState !== 'hidden') {
        const q = await loadIndices();
        // Keep showing the last good values if a refresh fails.
        if (!cancelled) setQuotes((prev) => q ?? (Array.isArray(prev) ? prev : null));
      }
      if (!cancelled) timer = window.setTimeout(tick, isMarketOpen() ? LIVE_MS : IDLE_MS);
    };
    tick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timer);
        tick();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const items = ORDER.map(({ key, name }) => {
    const q = Array.isArray(quotes) ? quotes.find((x) => x.key === key) : undefined;
    if (Array.isArray(quotes) && !q) return null; // index unavailable — skip rather than show a dash
    const change = q?.previousClose !== undefined ? q.price - q.previousClose : undefined;
    const pct = change !== undefined && q?.previousClose ? (change / q.previousClose) * 100 : undefined;
    const up = (change ?? 0) >= 0;
    return (
      <div key={key} className="flex items-baseline gap-1.5 @min-[900px]:gap-2 h-5 shrink-0">
        <span className="font-semibold text-ink-2">{name}</span>
        {q ? (
          <>
            <span className="text-ink-2 tabular-nums">{fmt(q.price)}</span>
            {change !== undefined && pct !== undefined && (
              <span className={cn('font-medium tabular-nums', up ? 'text-positive' : 'text-negative')}>
                {up ? '+' : '-'}
                {fmt(Math.abs(change))} ({Math.abs(pct).toFixed(2)}%)
              </span>
            )}
          </>
        ) : (
          <span className={cn(quotes === undefined ? 'text-faint animate-pulse' : 'text-muted')}>
            {quotes === undefined ? 'Loading…' : '—'}
          </span>
        )}
      </div>
    );
  });

  // Static strip, always the full "NAME  level  ±points (±pct%)", spread evenly.
  // On narrower headers the text and gaps step down so all three still fit.
  return (
    <div className="@container flex-1 min-w-0 h-5" aria-label="Market indices">
      <div className="h-5 overflow-hidden flex items-center justify-between gap-x-4 whitespace-nowrap text-[13px] @max-[900px]:text-xs @max-[780px]:text-[11px] leading-5">
        {items}
      </div>
    </div>
  );
}
