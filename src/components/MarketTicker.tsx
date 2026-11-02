import { useEffect, useRef } from 'react';
import { cn } from './ui/cn';
import { useIndexQuotes, isStaleIndexQuote, type IndexQuote } from '../utils/indexQuotes';
import { useIndexResetWindow } from '../utils/marketHours';

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
 *  live update is visible without watching the digits. The flash runs as a Web
 *  Animation on the same element: re-keying/remounting it every tick (as this
 *  used to) rebuilt part of the strip once a second, which could interrupt a
 *  swipe along the mobile bar. */
function LivePrice({ value }: { value: number }) {
  const prev = useRef(value);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (value === prev.current) return;
    const up = value > prev.current;
    prev.current = value;
    const el = ref.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ backgroundColor: up ? 'rgb(34 197 94 / 0.35)' : 'rgb(239 68 68 / 0.35)' }, { backgroundColor: 'transparent' }],
      { duration: 900, easing: 'ease-out' }
    );
  }, [value]);
  return (
    <span ref={ref} className="text-ink-2 tabular-nums rounded px-0.5">
      {fmt(value)}
    </span>
  );
}

/** `resetWindow`: new trading day, before the open — show 0 rather than
 *  yesterday's close, until the feed delivers a level that is actually today's. */
function renderItems(quotes: IndexQuote[] | null | undefined, resetWindow = false) {
  return ORDER.map(({ key, name }) => {
    const q = Array.isArray(quotes) ? quotes.find((x) => x.key === key) : undefined;
    if (Array.isArray(quotes) && !q) return null; // index unavailable — skip rather than show a dash
    const reset = resetWindow && !!q && isStaleIndexQuote(q);
    const change = reset ? 0 : q?.previousClose !== undefined ? q.price - q.previousClose : undefined;
    const pct = reset ? 0 : change !== undefined && q?.previousClose ? (change / q.previousClose) * 100 : undefined;
    const up = (change ?? 0) >= 0;
    return (
      <div key={key} className="flex items-baseline gap-1.5 @min-[900px]:gap-2 h-5 shrink-0">
        <span className="font-semibold text-ink-2">{name}</span>
        {q ? (
          <>
            <LivePrice value={reset ? 0 : q.price} />
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
  const reset = useIndexResetWindow();
  const items = renderItems(quotes, reset);

  // Static strip, always the full "NAME  level  ±points (±pct%)", spread evenly.
  // On narrower headers the text and gaps step down so all three still fit.
  return (
    <div className="@container flex-1 min-w-0 h-5" aria-label="Market indices">
      <div className="h-5 overflow-hidden flex items-center justify-between gap-x-4 whitespace-nowrap text-sm @max-[900px]:text-[13px] @max-[780px]:text-xs leading-5">
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
  const reset = useIndexResetWindow();
  return (
    <div
      id={id}
      className={cn(
        'no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain h-9 flex items-center text-sm bg-surface border-b border-line',
        className
      )}
      style={{ touchAction: 'pan-x pan-y', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      aria-label="Market indices"
    >
      <div className="flex shrink-0 items-center gap-x-8 px-4 whitespace-nowrap">{renderItems(quotes, reset)}</div>
    </div>
  );
}
