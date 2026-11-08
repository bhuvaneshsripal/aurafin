import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bookmark, RefreshCw, Search, X } from 'lucide-react';
import { Card, EmptyState, LoadingState, PageHeader, cn } from '../components/ui';
import { useStockLookup } from '../hooks/useStockLookup';
import { readCache, writeCache } from '../utils/fetchCache';
import { WATCHLIST_CHANGED_EVENT, readSavedStocks, stockKey, toggleSavedStock } from '../utils/savedStocks';

interface VolumeStock {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume?: number;
  volumeMultiple?: number;
  /** Approximate traded value in ₹ (volume x price). */
  value?: number;
  dayHigh?: number;
  dayLow?: number;
  yearHigh?: number;
  yearLow?: number;
}

type SortKey = 'volume' | 'value' | 'change' | 'spike' | 'price';
type Filter = 'all' | 'gainers' | 'losers' | 'spikes' | 'saved';
type PriceBand = 'any' | 'u50' | 'u200' | 'u1000' | 'o1000';

const CACHE_NAME = 'high-volume-all';
const REFRESH_MS = 60_000;
const PAGE_SIZE = 50;

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'volume', label: 'Volume' },
  { key: 'value', label: 'Value' },
  { key: 'change', label: '% change' },
  { key: 'spike', label: 'Spike' },
  { key: 'price', label: 'Price' },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'gainers', label: 'Gainers' },
  { key: 'losers', label: 'Losers' },
  { key: 'spikes', label: '2× spikes' },
  { key: 'saved', label: 'Saved' },
];

const BANDS: { key: PriceBand; label: string; test: (p: number) => boolean }[] = [
  { key: 'any', label: 'Any price', test: () => true },
  { key: 'u50', label: 'Under ₹50', test: (p) => p < 50 },
  { key: 'u200', label: '₹50 – ₹200', test: (p) => p >= 50 && p < 200 },
  { key: 'u1000', label: '₹200 – ₹1,000', test: (p) => p >= 200 && p < 1000 },
  { key: 'o1000', label: 'Above ₹1,000', test: (p) => p >= 1000 },
];

/** 1,23,45,678 -> "1.23 Cr", 12,34,567 -> "12.35 L". */
function formatVolume(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

/** Rupee amounts in crore / lakh. */
function formatValue(n: number): string {
  if (n >= 1e7) return `₹${(n / 1e7).toLocaleString('en-IN', { maximumFractionDigits: 1 })} Cr`;
  if (n >= 1e5) return `₹${(n / 1e5).toFixed(1)} L`;
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const chip = (active: boolean) =>
  cn(
    'tap-scale shrink-0 rounded-full border px-3 h-8 text-[13px] font-medium transition-colors',
    active
      ? 'border-transparent bg-primary-soft text-primary-ink'
      : 'border-line bg-surface text-muted hover:bg-surface-hover hover:text-ink'
  );

/** Every NSE stock with today's traded volume, and how unusual that volume is. */
export default function HighVolume() {
  const navigate = useNavigate();
  const cached = useMemo(() => readCache<VolumeStock[]>(CACHE_NAME), []);
  const [stocks, setStocks] = useState<VolumeStock[] | null>(cached?.data ?? null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cached?.at ?? null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SortKey>('volume');
  const [asc, setAsc] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [band, setBand] = useState<PriceBand>('any');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(readSavedStocks().map((s) => stockKey(s.market, s.symbol)))
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 20_000);
      const res = await fetch('/api/market/volume', { cache: 'no-store', signal: ctrl.signal }).finally(() =>
        window.clearTimeout(t)
      );
      const json = await res.json();
      if (!res.ok || !Array.isArray(json?.stocks)) throw new Error('bad response');
      setStocks(json.stocks);
      setUpdatedAt(Date.now());
      setFailed(false);
      writeCache(CACHE_NAME, json.stocks);
    } catch {
      setFailed(true); // keep showing the last data we had
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && void load(), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  // Keep the bookmark state in step with the Watchlist / stock page.
  useEffect(() => {
    const sync = () => setSavedKeys(new Set(readSavedStocks().map((s) => stockKey(s.market, s.symbol))));
    window.addEventListener(WATCHLIST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, sync);
  }, []);

  // Any change to what is being asked for starts the list again from the top.
  useEffect(() => setLimit(PAGE_SIZE), [query, sort, asc, filter, band]);

  const hasSpike = (stocks ?? []).some((s) => s.volumeMultiple !== undefined);

  const summary = useMemo(() => {
    const list = stocks ?? [];
    return {
      total: list.length,
      up: list.filter((s) => s.changePct > 0).length,
      down: list.filter((s) => s.changePct < 0).length,
      spikes: list.filter((s) => (s.volumeMultiple ?? 0) >= 2).length,
    };
  }, [stocks]);

  // Search reaches past the list: any NSE stock that matches is looked up and added.
  const knownSymbols = useMemo(() => new Set((stocks ?? []).map((s) => s.symbol)), [stocks]);
  const { extras, searching } = useStockLookup<VolumeStock>(
    query,
    knownSymbols,
    (symbol) => `/api/market/volume?symbol=${encodeURIComponent(symbol)}`,
    'volume'
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const inBand = BANDS.find((b) => b.key === band)!.test;
    const extraSet = new Set(extras.map((e) => e.symbol));
    const list = [...(stocks ?? []), ...extras].filter((s) => {
      if (q && !extraSet.has(s.symbol) && !s.symbol.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
      if (!inBand(s.price)) return false;
      if (filter === 'gainers') return s.changePct > 0;
      if (filter === 'losers') return s.changePct < 0;
      if (filter === 'spikes') return (s.volumeMultiple ?? 0) >= 2;
      if (filter === 'saved') return savedKeys.has(stockKey('IN', s.symbol));
      return true;
    });
    const by: Record<SortKey, (s: VolumeStock) => number> = {
      volume: (s) => s.volume,
      value: (s) => s.value ?? s.volume * s.price,
      change: (s) => s.changePct,
      spike: (s) => s.volumeMultiple ?? -1,
      price: (s) => s.price,
    };
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => dir * (by[sort](a) - by[sort](b)));
  }, [stocks, extras, query, sort, asc, filter, band, savedKeys]);

  const visible = rows.slice(0, limit);

  const pickSort = (key: SortKey) => {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  };

  const toggleSave = (s: VolumeStock) => {
    toggleSavedStock({ symbol: s.symbol, name: s.name, market: 'IN', exchange: 'NSE' });
    setSavedKeys(new Set(readSavedStocks().map((x) => stockKey(x.market, x.symbol))));
  };

  const open = (s: VolumeStock) => navigate(`/stock?symbol=${encodeURIComponent(s.symbol)}&ex=NSE`);

  const filtersActive = filter !== 'all' || band !== 'any' || query.trim() !== '';
  const reset = () => {
    setFilter('all');
    setBand('any');
    setQuery('');
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="High volume"
        meta={updatedAt ? `Updated ${timeAgo(updatedAt)}${failed ? ' · offline, showing last data' : ''}` : undefined}
        actionsInline
        actions={
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh"
            className="icon-outline-green tap-scale h-9 w-9 flex items-center justify-center"
          >
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          </button>
        }
      />

      {stocks && stocks.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <span className="font-semibold text-ink tabular-nums">{summary.total.toLocaleString('en-IN')}</span> stocks
          </span>
          <span className="text-emerald-700">
            ▲ <span className="font-semibold tabular-nums">{summary.up}</span> up
          </span>
          <span className="text-red-600">
            ▼ <span className="font-semibold tabular-nums">{summary.down}</span> down
          </span>
          {hasSpike && (
            <span className="text-amber-700">
              <span className="font-semibold tabular-nums">{summary.spikes}</span> with 2× usual volume
            </span>
          )}
        </div>
      )}

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any stock"
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm text-ink outline-none focus:border-primary"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-muted hover:bg-surface-hover"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar">
        {FILTERS.filter((f) => f.key !== 'spikes' || hasSpike).map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>
            {f.label}
          </button>
        ))}
        <select
          value={band}
          onChange={(e) => setBand(e.target.value as PriceBand)}
          aria-label="Price range"
          className={cn(chip(band !== 'any'), 'appearance-none pr-3 outline-none')}
        >
          {BANDS.map((b) => (
            <option key={b.key} value={b.key}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      {/* Sort: tap the active one again to flip the direction */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar">
        <span className="shrink-0 text-xs font-medium text-faint">Sort</span>
        {SORTS.filter((s) => s.key !== 'spike' || hasSpike).map((s) => (
          <button key={s.key} type="button" onClick={() => pickSort(s.key)} className={cn(chip(sort === s.key), 'inline-flex items-center gap-1')}>
            {s.label}
            {sort === s.key && (asc ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
          </button>
        ))}
      </div>

      {stocks === null && loading ? (
        <LoadingState label="Loading all stocks" />
      ) : stocks === null ? (
        <EmptyState
          title="Couldn't load volume data"
          description="NSE didn't respond. Check your connection and try again."
          action={
            <button type="button" onClick={() => void load()} className="text-sm font-medium text-primary-ink hover:underline">
              Try again
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          title={searching ? 'Searching all NSE stocks…' : filter === 'saved' && !query ? 'No saved stocks here yet' : 'No stocks match'}
          description={filter === 'saved' && !query ? 'Tap the bookmark on any stock to save it.' : undefined}
          action={
            filtersActive ? (
              <button type="button" onClick={reset} className="text-sm font-medium text-primary-ink hover:underline">
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted">
            Showing {Math.min(visible.length, rows.length).toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')}
          </p>
          <Card padding="none" className="divide-y divide-line-soft">
            {visible.map((s, i) => {
              const up = s.changePct >= 0;
              const saved = savedKeys.has(stockKey('IN', s.symbol));
              const nearHigh = s.yearHigh !== undefined && s.price >= s.yearHigh * 0.98;
              const nearLow = s.yearLow !== undefined && s.price <= s.yearLow * 1.02;
              return (
                <div
                  key={s.symbol}
                  role="button"
                  tabIndex={0}
                  onClick={() => open(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      open(s);
                    }
                  }}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-hover"
                >
                  <span className="w-6 shrink-0 text-xs text-faint tabular-nums">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.symbol}</p>
                    <p className="truncate text-xs text-muted">{s.name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                      <span>
                        Vol <span className="font-medium text-ink-2">{formatVolume(s.volume)}</span>
                      </span>
                      {s.value !== undefined && (
                        <span>
                          Val <span className="font-medium text-ink-2">{formatValue(s.value)}</span>
                        </span>
                      )}
                      {s.volumeMultiple !== undefined && s.volumeMultiple >= 1.5 && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          {s.volumeMultiple.toFixed(1)}× usual
                        </span>
                      )}
                      {nearHigh && (
                        <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                          Near 52W high
                        </span>
                      )}
                      {nearLow && (
                        <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                          Near 52W low
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-ink tabular-nums">
                      ₹{s.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </p>
                    <p className={cn('text-xs font-medium tabular-nums', up ? 'text-emerald-700' : 'text-red-600')}>
                      {up ? '+' : ''}
                      {s.changePct.toFixed(2)}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSave(s);
                    }}
                    aria-label={saved ? `Remove ${s.symbol} from watchlist` : `Save ${s.symbol} to watchlist`}
                    aria-pressed={saved}
                    className={cn(
                      'tap-scale -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover',
                      saved ? 'text-primary-ink' : 'text-faint'
                    )}
                  >
                    <Bookmark size={16} className={cn(saved && 'fill-current')} />
                  </button>
                </div>
              );
            })}
          </Card>
          {rows.length > visible.length && (
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setLimit((n) => n + PAGE_SIZE)}
                className="tap-scale h-10 rounded-full border border-line bg-surface px-5 text-sm font-medium text-ink hover:bg-surface-hover"
              >
                Show {Math.min(PAGE_SIZE, rows.length - visible.length)} more
              </button>
              <button
                type="button"
                onClick={() => setLimit(rows.length)}
                className="tap-scale h-10 rounded-full px-3 text-sm font-medium text-primary-ink hover:underline"
              >
                Show all ({(rows.length - visible.length).toLocaleString('en-IN')} left)
              </button>
            </div>
          )}
        </>
      )}
      <p className="text-center text-[11px] text-faint">Source: NSE India. Data can be delayed. Not investment advice.</p>
    </div>
  );
}
