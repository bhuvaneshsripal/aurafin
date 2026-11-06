import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
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
 *  NAME  level  ±points (±pct%) on a single line. Swipe it sideways to see all
 *  three (NIFTY, SENSEX, BANKNIFTY), or swipe it DOWN to open the full
 *  Indian / Global indices page. */
export function MarketTickerMarquee({ className, id }: { className?: string; id?: string }) {
  const quotes = useIndexQuotes();
  const reset = useIndexResetWindow();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let s: { x: number; y: number; fired: boolean } | null = null;
    const onStart = (e: TouchEvent) => {
      s = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, fired: false } : null;
    };
    const onMove = (e: TouchEvent) => {
      if (!s || s.fired) return;
      const dy = e.touches[0].clientY - s.y; // positive = finger moved down
      const dx = Math.abs(e.touches[0].clientX - s.x);
      if (dy > 28 && dy > dx * 1.5) {
        s.fired = true;
        if (e.cancelable) e.preventDefault();
        try { navigator.vibrate?.(6); } catch { /* haptics are best-effort */ }
        navigate('/indices');
      }
    };
    const onEnd = () => { s = null; };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [navigate]);

  return (
    <div
      id={id}
      ref={ref}
      className={cn(
        'no-scrollbar overflow-x-auto overflow-y-hidden overscroll-x-contain h-9 flex items-center text-sm bg-surface border-b border-line',
        className
      )}
      // pan-x only: a vertical drag on the bar is the "open indices" gesture, not a page scroll.
      style={{ touchAction: 'pan-x', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
      aria-label="Market indices"
    >
      <div className="flex shrink-0 items-center gap-x-8 px-4 whitespace-nowrap">{renderItems(quotes, reset)}</div>
    </div>
  );
}
