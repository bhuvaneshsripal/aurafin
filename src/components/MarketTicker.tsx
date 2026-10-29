import { useEffect, useRef, useState } from 'react';
import { cn } from './ui/cn';
import { useIndexQuotes, type IndexQuote } from '../utils/indexQuotes';

const ORDER = [
  { key: 'nifty', name: 'NIFTY' },
  { key: 'sensex', name: 'SENSEX' },
  { key: 'banknifty', name: 'BANKNIFTY' },
];

// One shared formatter: `n.toLocaleString(locale, options)` builds a brand-new
// Intl.NumberFormat on every call, and this runs ~9 times per strip on every
// 1-second price update.
const levelFormatter = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => levelFormatter.format(n);

// Quotes come from the shared poller in utils/indexQuotes: polled every second
// during market hours (30s otherwise) while the tab is visible, with ONE
// request loop no matter how many strips are on screen. (The desktop strip and
// the mobile strip below are both always mounted — one is hidden by CSS — so
// they used to run two separate pollers.)

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
export function MarketTickerMarquee({ className, id }: { className?: string; id?: string }) {
  const quotes = useIndexQuotes();
  return (
    <div
      id={id}
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
