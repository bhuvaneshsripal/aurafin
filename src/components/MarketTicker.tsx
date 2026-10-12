import { useEffect, useState } from 'react';
import { cn } from './ui/cn';

interface IndexQuote {
  key: string;
  name: string;
  price: number;
  previousClose?: number;
}

const POLL_MS = 30_000;
const ORDER = [
  { key: 'nifty', name: 'NIFTY' },
  { key: 'sensex', name: 'SENSEX' },
  { key: 'banknifty', name: 'BANKNIFTY' },
  { key: 'midcpnifty', name: 'MIDCPNIFTY' },
  { key: 'finnifty', name: 'FINNIFTY' },
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

/** One-line index strip: NAME  level  ±change (±pct%). Polled every 30s
 *  while the tab is visible; overflow fades out at the right edge. */
export default function MarketTicker() {
  const [quotes, setQuotes] = useState<IndexQuote[] | null | undefined>(undefined); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (document.visibilityState === 'hidden') return;
      const q = await loadIndices();
      // Keep showing the last good values if a refresh fails.
      if (!cancelled) setQuotes((prev) => q ?? (Array.isArray(prev) ? prev : null));
    };
    run();
    const id = window.setInterval(run, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return (
    <div
      // flex-wrap + a one-line height: any index that doesn't fit wraps onto a
      // clipped second line, so each one shows completely or not at all
      // (never cut off mid-number).
      className="flex flex-wrap content-start gap-x-8 h-5 flex-1 min-w-0 overflow-hidden whitespace-nowrap text-[13px] leading-5"
      aria-label="Market indices"
    >
      {ORDER.map(({ key, name }) => {
        const q = Array.isArray(quotes) ? quotes.find((x) => x.key === key) : undefined;
        if (Array.isArray(quotes) && !q) return null; // index unavailable — skip rather than show a dash
        const change = q?.previousClose !== undefined ? q.price - q.previousClose : undefined;
        const pct = change !== undefined && q?.previousClose ? (change / q.previousClose) * 100 : undefined;
        const up = (change ?? 0) >= 0;
        return (
          <div key={key} className="flex items-baseline gap-2 h-5 shrink-0">
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
      })}
    </div>
  );
}
