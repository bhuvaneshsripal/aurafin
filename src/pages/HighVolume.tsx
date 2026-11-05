import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Card, EmptyState, LoadingState, PageHeader, SegmentedControl, cn } from '../components/ui';
import { readCache, writeCache } from '../utils/fetchCache';

interface VolumeStock {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  avgVolume?: number;
  volumeMultiple?: number;
}

type SortKey = 'volume' | 'change' | 'spike';

const CACHE_NAME = 'high-volume';
const REFRESH_MS = 60_000;

/** 1,23,45,678 -> "1.23 Cr", 12,34,567 -> "12.35 L". */
function formatVolume(n: number): string {
  if (n >= 1e7) return `${(n / 1e7).toFixed(2)} Cr`;
  if (n >= 1e5) return `${(n / 1e5).toFixed(2)} L`;
  return n.toLocaleString('en-IN');
}

function timeAgo(at: number): string {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Stocks trading the most shares today on NSE, with how unusual that volume is. */
export default function HighVolume() {
  const cached = useMemo(() => readCache<VolumeStock[]>(CACHE_NAME), []);
  const [stocks, setStocks] = useState<VolumeStock[] | null>(cached?.data ?? null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cached?.at ?? null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SortKey>('volume');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 12_000);
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

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (stocks ?? []).filter(
      (s) => !q || s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    );
    const by: Record<SortKey, (s: VolumeStock) => number> = {
      volume: (s) => s.volume,
      change: (s) => s.changePct,
      spike: (s) => s.volumeMultiple ?? -1,
    };
    return [...list].sort((a, b) => by[sort](b) - by[sort](a));
  }, [stocks, query, sort]);

  const hasSpike = (stocks ?? []).some((s) => s.volumeMultiple !== undefined);

  return (
    <div className="space-y-4">
      <PageHeader
        title="High volume"
        description="NSE stocks with the most shares traded today"
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stocks"
            className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none focus:border-primary"
          />
        </div>
        <SegmentedControl<SortKey>
          size="sm"
          value={sort}
          onChange={setSort}
          items={[
            { key: 'volume', label: 'Volume' },
            { key: 'change', label: '% change' },
            ...(hasSpike ? [{ key: 'spike' as const, label: 'Spike' }] : []),
          ]}
        />
      </div>

      {stocks === null && loading ? (
        <LoadingState label="Loading volume leaders" />
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
        <EmptyState compact title="No stocks match your search" />
      ) : (
        <Card padding="none" className="divide-y divide-line-soft">
          {rows.map((s, i) => {
            const up = s.changePct >= 0;
            return (
              <div key={s.symbol} className="flex items-center gap-3 px-4 py-3">
                <span className="w-5 shrink-0 text-xs text-faint tabular-nums">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.symbol}</p>
                  <p className="truncate text-xs text-muted">{s.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    Vol <span className="font-medium text-ink-2">{formatVolume(s.volume)}</span>
                    {s.volumeMultiple !== undefined && s.volumeMultiple >= 1.5 && (
                      <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        {s.volumeMultiple.toFixed(1)}× usual
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
              </div>
            );
          })}
        </Card>
      )}
      <p className="text-center text-[11px] text-faint">Source: NSE India. Data can be delayed. Not investment advice.</p>
    </div>
  );
}
