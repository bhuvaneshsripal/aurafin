import { useEffect, useRef, useState } from 'react';
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
    // Abort a hung request so one slow response can't freeze the updates.
    const ctrl = new AbortController();
    const abort = window.setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`/api/market/indices?_=${Date.now()}`, { cache: 'no-store', signal: ctrl.signal }).finally(() =>
      window.clearTimeout(abort)
    );
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
const CACHE_KEY = 'aurafin.tickerQuotes';

/** Last good quotes from the previous visit, so a refresh shows numbers straight away. */
function readCachedQuotes(): IndexQuote[] | undefined {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function useIndexQuotes() {
  const [quotes, setQuotes] = useState<IndexQuote[] | null | undefined>(readCachedQuotes); // undefined = loading

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    // Generation token: restarting the loop (tab becomes visible again) bumps
    // it, so a request still in flight from the previous chain can't also
    // schedule its own next tick -- otherwise every tab switch could leave an
    // extra poller running forever.
    let generation = 0;
    // Chained timeouts (not setInterval) so a slow response never overlaps the next request.
    const tick = async () => {
      const myGeneration = ++generation;
      const startedAt = Date.now();
      if (document.visibilityState !== 'hidden') {
        const q = await loadIndices();
        // Keep showing the last good values if a refresh fails.
        if (!cancelled && myGeneration === generation) setQuotes((prev) => q ?? (Array.isArray(prev) ? prev : null));
        if (q) {
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify(q));
          } catch {
            /* storage unavailable — fine, just no instant paint next time */
          }
        }
      }
      // Count the interval from when the request started (not finished), so
      // a 400ms response still gives a true one-second cadence.
      const interval = isMarketOpen() ? LIVE_MS : IDLE_MS;
      if (!cancelled && myGeneration === generation) {
        timer = window.setTimeout(tick, Math.max(0, interval - (Date.now() - startedAt)));
      }
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
  return quotes;
}

/** Price that briefly flashes green/red whenever the number changes, so a
 *  live update is visible without watching the digits. */
function LivePrice({ value }: { value: number }) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<{ dir: 'up' | 'down'; n: number } | null>(null);
  useEffect(() => {
    if (value !== prev.current) {
      setFlash((f) => ({ dir: value > prev.current ? 'up' : 'down', n: (f?.n ?? 0) + 1 }));
      prev.current = value;
    }
  }, [value]);
  return (
    <span
      key={flash?.n ?? 0}
      className={cn('text-ink-2 tabular-nums rounded px-0.5', flash && (flash.dir === 'up' ? 'ticker-flash-up' : 'ticker-flash-down'))}
    >
      {fmt(value)}
    </span>
  );
}

function renderItems(quotes: IndexQuote[] | null | undefined) {
  return ORDER.map(({ key, name }) => {
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
            <LivePrice value={q.price} />
            {change !== undefined && pct !== undefined && (
              <span className={cn('font-medium tabular-nums', up ? 'text-positive' : 'text-negative')}>
                {up ? '+' : '-'}
                {fmt(Math.abs(change))} ({Math.abs(pct).toFixed(2)}%)
              </span>
            )}
          </>
        ) : (
          <span className={cn(quotes === undefined ? 'text-faint animate-pulse' : 'text-muted')}>
            {quotes === undefined ? '…' : '—'}
          </span>
        )}
      </div>
    );
  });
}

/** Desktop: static strip in the top bar. */
export default function MarketTicker() {
  const quotes = useIndexQuotes();
  const items = renderItems(quotes);

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

/** Mobile: a thin one-line bar under the top bar. Each index shows
 *  NAME  level  ±points (±pct%) on a single line, and the person swipes the
 *  bar sideways to see all three (NIFTY, SENSEX, BANKNIFTY). */
export function MarketTickerMarquee({ className }: { className?: string }) {
  const quotes = useIndexQuotes();
  return (
    <div
      className={cn(
        'no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain h-9 flex items-center text-[12.5px] bg-surface border-b border-line',
        className
      )}
      style={{ touchAction: 'pan-x', scrollbarWidth: 'none' }}
      aria-label="Market indices"
    >
      <div className="flex shrink-0 items-center gap-x-8 px-4 whitespace-nowrap">{renderItems(quotes)}</div>
    </div>
  );
}
