import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Badge, Card, cn } from './ui';
import { inr } from '../utils/valuation';

/** A saved stock with the numbers from the last time it was valued. */
export type WatchItem = {
  symbol: string;
  name: string;
  exchange: 'NSE' | 'BSE';
  price: number;
  x2: number;
  x3: number;
  savedAt: number;
};

export const WATCHLIST_KEY = 'aurafin.valuation.watchlist';

export function readWatchlist(): WatchItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || '[]');
    return Array.isArray(v)
      ? v.filter(
          (w) =>
            w &&
            typeof w.symbol === 'string' &&
            (w.exchange === 'NSE' || w.exchange === 'BSE') &&
            [w.price, w.x2, w.x3].every((n) => typeof n === 'number' && n > 0),
        )
      : [];
  } catch {
    return [];
  }
}

export function writeWatchlist(w: WatchItem[]) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(w));
  } catch {
    /* storage unavailable */
  }
}

type Status = 'deep' | 'under' | 'exp';
const STATUS: Record<Status, { label: string; variant: 'success' | 'warning' }> = {
  deep: { label: 'Deep value', variant: 'success' },
  under: { label: 'Undervalued', variant: 'success' },
  exp: { label: 'Expensive', variant: 'warning' },
};
const statusOf = (w: WatchItem): Status => (w.price <= w.x3 ? 'deep' : w.price <= w.x2 ? 'under' : 'exp');
/** Negative = below X/2 (cheaper). Used for sorting and the text under the price. */
const vsX2 = (w: WatchItem) => ((w.price - w.x2) / w.x2) * 100;

const FILTERS: { id: 'all' | Status; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'deep', label: 'Deep value' },
  { id: 'under', label: 'Undervalued' },
  { id: 'exp', label: 'Expensive' },
];

export default function ValuationWatchlist({
  items,
  onOpen,
  onRemove,
}: {
  items: WatchItem[];
  onOpen: (w: WatchItem) => void;
  onRemove: (w: WatchItem) => void;
}) {
  const [filter, setFilter] = useState<'all' | Status>('all');

  const shown = useMemo(
    () =>
      items
        .filter((w) => filter === 'all' || statusOf(w) === filter)
        // Cheapest against X/2 first.
        .sort((a, b) => vsX2(a) - vsX2(b)),
    [items, filter],
  );

  if (items.length === 0) return null;

  return (
    <section aria-label="Watchlist" className="mb-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="mr-1 text-sm font-semibold text-ink">Watchlist</h2>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              '!rounded-md inline-flex h-8 items-center border px-3.5 text-xs font-semibold transition-colors',
              filter === f.id
                ? 'border-transparent bg-brand-600 text-white dark:bg-brand-500'
                : 'border-line bg-surface text-muted hover:bg-surface-hover',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">No saved stocks in this group.</p>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((w: WatchItem) => {
            const st = STATUS[statusOf(w)];
            const d = vsX2(w);
            const note =
              d > 0
                ? d > 100
                  ? `${(w.price / w.x2).toFixed(0)}x above X/2`
                  : `${d.toFixed(0)}% above X/2`
                : w.price >= w.x3
                  ? `${Math.abs(d).toFixed(0)}% below X/2`
                  : `${(((w.x3 - w.price) / w.x3) * 100).toFixed(0)}% below X/3`;
            return (
              <li key={`${w.symbol}-${w.exchange}`} className="relative">
                <button
                  type="button"
                  onClick={() => onOpen(w)}
                  className="tap-scale h-full w-full rounded-2xl border border-line bg-surface p-4 pr-10 text-left shadow-card transition-colors hover:bg-surface-hover"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-semibold text-ink">{w.name || w.symbol}</span>
                    <Badge variant={st.variant} className="!rounded-full px-2.5 shrink-0">{st.label}</Badge>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <span className="text-lg font-semibold text-ink font-numeric">{inr(w.price)}</span>
                    <span className={cn('text-xs font-semibold', st.variant === 'success' ? 'text-positive' : 'text-warning')}>{note}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted font-numeric">
                    X/3 {inr(w.x3)} · X/2 {inr(w.x2)} · as of {new Date(w.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                  </div>
                </button>
                <button
                  type="button"
                  aria-label={`Remove ${w.symbol} from watchlist`}
                  onClick={() => onRemove(w)}
                  className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-ink"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
