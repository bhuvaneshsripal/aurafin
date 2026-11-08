import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bookmark, RefreshCw, Search, X } from 'lucide-react';
import { Card, EmptyState, LoadingState, PageHeader, cn } from '../components/ui';
import Modal from '../components/Modal';
import { readCache, writeCache } from '../utils/fetchCache';
import { WATCHLIST_CHANGED_EVENT, readSavedStocks, stockKey, toggleSavedStock } from '../utils/savedStocks';

type Setup = 'breakout' | 'pullback' | 'bounce' | 'none';
type Index = 'NIFTY 50' | 'NIFTY 200' | 'NIFTY 500';

interface SwingStock {
  symbol: string;
  name: string;
  setup: Setup;
  score: number;
  close: number;
  changePct: number;
  rsi: number | null;
  ema20: number | null;
  ema50: number | null;
  sma200: number | null;
  atr: number | null;
  relVol: number | null;
  macdHist: number | null;
  high52: number;
  reasons: string[];
  plan: { entry: number; stop: number; target: number; riskPct: number; rr: number } | null;
  series?: { c: (number | null)[]; e20: (number | null)[]; e50: (number | null)[] };
}

interface ScanData {
  index: Index;
  stocks: SwingStock[];
  scanned: number;
  failed: number;
  universe: number;
}

const SETUP_LABEL: Record<Setup, string> = {
  breakout: 'Breakout',
  pullback: 'Pullback',
  bounce: 'Oversold bounce',
  none: 'No setup',
};
const SETUP_STYLE: Record<Setup, string> = {
  breakout: 'bg-emerald-100 text-emerald-800',
  pullback: 'bg-sky-100 text-sky-800',
  bounce: 'bg-amber-100 text-amber-800',
  none: 'bg-slate-100 text-slate-600',
};
const SETUP_HELP: Record<Exclude<Setup, 'none'>, string> = {
  breakout: 'Closed above its 20-day high on higher volume.',
  pullback: 'In an uptrend and has dipped back to its 20-day average.',
  bounce: 'Oversold (low RSI) and starting to turn up.',
};

type Filter = 'every' | 'setups' | Setup;
type SortKey = 'score' | 'change' | 'rsi' | 'volume' | 'high' | 'price';
type MinScore = 0 | 50 | 70;

const INDEXES: { key: Index; label: string }[] = [
  { key: 'NIFTY 50', label: 'Nifty 50' },
  { key: 'NIFTY 200', label: 'Nifty 200' },
  { key: 'NIFTY 500', label: 'Nifty 500' },
];
const SORTS: { key: SortKey; label: string }[] = [
  { key: 'score', label: 'Score' },
  { key: 'change', label: '% change' },
  { key: 'rsi', label: 'RSI' },
  { key: 'volume', label: 'Volume ×' },
  { key: 'high', label: '52W high' },
  { key: 'price', label: 'Price' },
];

const BATCH = 60;
const PAGE_SIZE = 50;
const cacheName = (i: Index) => `swing-scan-${i.replace(' ', '-').toLowerCase()}`;
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
/** How far the price sits below its 52-week high, as a positive percent (0 = at the high). */
const belowHigh = (s: SwingStock) => (s.high52 > 0 ? Math.max(0, (1 - s.close / s.high52) * 100) : 0);

function timeAgo(at: number): string {
  const m = Math.round(Math.max(0, Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

const chip = (active: boolean) =>
  cn(
    'tap-scale shrink-0 rounded-full border px-3 h-8 text-[13px] font-medium transition-colors',
    active
      ? 'border-transparent bg-primary-soft text-primary-ink'
      : 'border-line bg-surface text-muted hover:bg-surface-hover hover:text-ink'
  );

/** Swing-trade scanner: ranks NSE stocks (Nifty 50 / 200 / 500) by simple, explainable technical setups. */
export default function SwingScanner() {
  const navigate = useNavigate();
  const [index, setIndex] = useState<Index>('NIFTY 200');
  const [data, setData] = useState<ScanData | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('every');
  const [sort, setSort] = useState<SortKey>('score');
  const [asc, setAsc] = useState(false);
  const [minScore, setMinScore] = useState<MinScore>(0);
  const [above200, setAbove200] = useState(false);
  const [nearHigh, setNearHigh] = useState(false);
  const [volSpike, setVolSpike] = useState(false);
  const [onlySaved, setOnlySaved] = useState(false);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [open, setOpen] = useState<SwingStock | null>(null);
  const [savedKeys, setSavedKeys] = useState<Set<string>>(
    () => new Set(readSavedStocks().map((s) => stockKey(s.market, s.symbol)))
  );
  const run = useRef(0);

  // Scans the chosen index batch by batch; the list fills in as each batch arrives.
  const load = useCallback(async (idx: Index) => {
    const id = ++run.current;
    setLoading(true);
    setFailed(false);
    setProgress(0);
    const acc = new Map<string, SwingStock>();
    let offset: number | null = 0;
    let universe = 0;
    let failedCount = 0;
    let gotAny = false;
    try {
      while (offset !== null) {
        const ctrl = new AbortController();
        const t = window.setTimeout(() => ctrl.abort(), 35_000);
        const res: Response = await fetch(
          `/api/market/swing?index=${encodeURIComponent(idx)}&offset=${offset}&limit=${BATCH}`,
          { signal: ctrl.signal }
        ).finally(() => window.clearTimeout(t));
        const json = await res.json();
        if (!res.ok || !Array.isArray(json?.stocks)) throw new Error('bad response');
        if (run.current !== id) return; // a newer scan (or another index) took over
        for (const s of json.stocks as SwingStock[]) acc.set(s.symbol, s);
        gotAny = true;
        universe = json.universe;
        failedCount += json.failed ?? 0;
        offset = json.nextOffset ?? null;
        setProgress(offset ?? universe);
        setData({
          index: idx,
          stocks: [...acc.values()].sort((a, b) => b.score - a.score),
          scanned: acc.size,
          failed: failedCount,
          universe,
        });
      }
      const final: ScanData = {
        index: idx,
        stocks: [...acc.values()].sort((a, b) => b.score - a.score),
        scanned: acc.size,
        failed: failedCount,
        universe,
      };
      setUpdatedAt(Date.now());
      writeCache(cacheName(idx), final);
    } catch {
      if (run.current === id) setFailed(true); // keep whatever we already have
      if (!gotAny) return;
    } finally {
      if (run.current === id) setLoading(false);
    }
  }, []);

  // Show the last scan of this index straight away, then refresh it.
  useEffect(() => {
    const cached = readCache<ScanData>(cacheName(index));
    setData(cached?.data ?? null);
    setUpdatedAt(cached?.at ?? null);
    void load(index);
    return () => {
      run.current++;
    };
  }, [index, load]);

  useEffect(() => {
    const sync = () => setSavedKeys(new Set(readSavedStocks().map((s) => stockKey(s.market, s.symbol))));
    window.addEventListener(WATCHLIST_CHANGED_EVENT, sync);
    return () => window.removeEventListener(WATCHLIST_CHANGED_EVENT, sync);
  }, []);

  useEffect(() => setLimit(PAGE_SIZE), [index, filter, sort, asc, minScore, above200, nearHigh, volSpike, onlySaved, query]);

  const counts = useMemo(() => {
    const c = { breakout: 0, pullback: 0, bounce: 0, none: 0 };
    for (const s of data?.stocks ?? []) c[s.setup] += 1;
    return c;
  }, [data]);
  const setupCount = counts.breakout + counts.pullback + counts.bounce;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const by: Record<SortKey, (s: SwingStock) => number> = {
      score: (s) => s.score,
      change: (s) => s.changePct,
      rsi: (s) => s.rsi ?? -1,
      volume: (s) => s.relVol ?? -1,
      high: (s) => -belowHigh(s), // closest to the high first when descending
      price: (s) => s.close,
    };
    const dir = asc ? 1 : -1;
    return (data?.stocks ?? [])
      .filter((s) => {
        if (q && !s.symbol.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false;
        if (filter === 'setups' && s.setup === 'none') return false;
        if (filter !== 'every' && filter !== 'setups' && s.setup !== filter) return false;
        if (s.score < minScore) return false;
        if (above200 && !(s.sma200 != null && s.close > s.sma200)) return false;
        if (nearHigh && belowHigh(s) > 5) return false;
        if (volSpike && !((s.relVol ?? 0) >= 1.5)) return false;
        if (onlySaved && !savedKeys.has(stockKey('IN', s.symbol))) return false;
        return true;
      })
      .sort((a, b) => dir * (by[sort](a) - by[sort](b)) || b.score - a.score);
  }, [data, query, filter, sort, asc, minScore, above200, nearHigh, volSpike, onlySaved, savedKeys]);

  const visible = rows.slice(0, limit);
  const filtersActive = filter !== 'every' || minScore !== 0 || above200 || nearHigh || volSpike || onlySaved || query.trim() !== '';
  const clearFilters = () => {
    setFilter('every');
    setMinScore(0);
    setAbove200(false);
    setNearHigh(false);
    setVolSpike(false);
    setOnlySaved(false);
    setQuery('');
  };
  const pickSort = (key: SortKey) => {
    if (key === sort) setAsc((v) => !v);
    else {
      setSort(key);
      setAsc(false);
    }
  };
  const toggleSave = (s: SwingStock) => {
    toggleSavedStock({ symbol: s.symbol, name: s.name, market: 'IN', exchange: 'NSE' });
    setSavedKeys(new Set(readSavedStocks().map((x) => stockKey(x.market, x.symbol))));
  };

  const filterItems: { key: Filter; label: string }[] = [
    { key: 'every', label: `All stocks (${data?.scanned ?? 0})` },
    { key: 'setups', label: `Setups (${setupCount})` },
    { key: 'breakout', label: `Breakout (${counts.breakout})` },
    { key: 'pullback', label: `Pullback (${counts.pullback})` },
    { key: 'bounce', label: `Bounce (${counts.bounce})` },
    { key: 'none', label: `No setup (${counts.none})` },
  ];

  const meta = data
    ? loading
      ? `Scanning ${Math.min(progress, data.universe)} of ${data.universe}\u2026`
      : `Scanned ${data.scanned} of ${data.universe} stocks${updatedAt ? ` \u00b7 ${timeAgo(updatedAt)}` : ''}${
          failed ? ' \u00b7 offline, showing last scan' : ''
        }`
    : undefined;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Swing scanner"
        meta={meta}
        actionsInline
        actions={
          <button
            type="button"
            onClick={() => void load(index)}
            aria-label="Rescan"
            className="icon-outline-green tap-scale h-9 w-9 flex items-center justify-center"
          >
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          </button>
        }
      />

      <div className="flex gap-2">
        {INDEXES.map((i) => (
          <button key={i.key} type="button" onClick={() => setIndex(i.key)} className={chip(index === i.key)}>
            {i.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any stock in the scan"
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

      {/* Setup type */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar">
        {filterItems.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} className={chip(filter === f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Extra filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar">
        <select
          value={minScore}
          onChange={(e) => setMinScore(Number(e.target.value) as MinScore)}
          aria-label="Minimum score"
          className={cn(chip(minScore !== 0), 'appearance-none outline-none')}
        >
          <option value={0}>Any score</option>
          <option value={50}>Score 50+</option>
          <option value={70}>Score 70+</option>
        </select>
        <button type="button" onClick={() => setAbove200((v) => !v)} className={chip(above200)}>
          Above 200-day
        </button>
        <button type="button" onClick={() => setNearHigh((v) => !v)} className={chip(nearHigh)}>
          Near 52W high
        </button>
        <button type="button" onClick={() => setVolSpike((v) => !v)} className={chip(volSpike)}>
          Volume 1.5×+
        </button>
        <button type="button" onClick={() => setOnlySaved((v) => !v)} className={chip(onlySaved)}>
          Saved
        </button>
      </div>

      {/* Sort: tap the active one again to flip the direction */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-0.5 no-scrollbar">
        <span className="shrink-0 text-xs font-medium text-faint">Sort</span>
        {SORTS.map((s) => (
          <button key={s.key} type="button" onClick={() => pickSort(s.key)} className={cn(chip(sort === s.key), 'inline-flex items-center gap-1')}>
            {s.label}
            {sort === s.key && (asc ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
          </button>
        ))}
      </div>

      {data === null && loading ? (
        <LoadingState label={`Scanning the ${INDEXES.find((i) => i.key === index)?.label}. The list fills in as it goes`} />
      ) : data === null ? (
        <EmptyState
          title="Couldn't run the scan"
          description="The market data source didn't respond. Try again in a moment."
          action={
            <button type="button" onClick={() => void load(index)} className="text-sm font-medium text-primary-ink hover:underline">
              Try again
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          title={loading ? 'Nothing yet, still scanning' : 'No stocks match'}
          description={loading ? undefined : 'Try another setup or clear the filters.'}
          action={
            filtersActive ? (
              <button type="button" onClick={clearFilters} className="text-sm font-medium text-primary-ink hover:underline">
                Clear filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-xs text-muted">
            Showing {visible.length.toLocaleString('en-IN')} of {rows.length.toLocaleString('en-IN')}
            {data.failed > 0 && !loading && (
              <span className="text-amber-700"> · {data.failed} couldn't be scanned (rescan to retry)</span>
            )}
          </p>
          <Card padding="none" className="divide-y divide-line-soft">
            {visible.map((s) => {
              const saved = savedKeys.has(stockKey('IN', s.symbol));
              const off = belowHigh(s);
              return (
                <div key={s.symbol} className="flex items-center gap-1 pr-2 hover:bg-surface-hover">
                  <button
                    type="button"
                    onClick={() => setOpen(s)}
                    className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-4 text-left"
                  >
                    <ScoreRing score={s.score} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">{s.symbol}</p>
                      <p className="truncate text-xs text-muted">{s.name}</p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                        <span className={cn('rounded-full px-1.5 py-0.5 text-[10px] font-semibold', SETUP_STYLE[s.setup])}>
                          {SETUP_LABEL[s.setup]}
                        </span>
                        {s.rsi != null && <span>RSI {s.rsi}</span>}
                        {s.relVol != null && <span>Vol {s.relVol}×</span>}
                        <span>{off < 0.5 ? 'At 52W high' : `${off.toFixed(0)}% below high`}</span>
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-sm font-semibold text-ink tabular-nums">{inr(s.close)}</p>
                      <p className={cn('text-xs font-medium tabular-nums', s.changePct >= 0 ? 'text-emerald-700' : 'text-red-600')}>
                        {s.changePct >= 0 ? '+' : ''}
                        {s.changePct.toFixed(2)}%
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleSave(s)}
                    aria-label={saved ? `Remove ${s.symbol} from watchlist` : `Save ${s.symbol} to watchlist`}
                    aria-pressed={saved}
                    className={cn(
                      'tap-scale flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-surface-hover',
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

      <p className="text-center text-[11px] text-faint">
        A mechanical screen on daily candles (Yahoo Finance), not a recommendation. Prices can be delayed.
        Entry, stop and target are illustrations; do your own research.
      </p>

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.symbol} · swing view` : ''}>
        {open && (
          <StockDetail
            s={open}
            saved={savedKeys.has(stockKey('IN', open.symbol))}
            onToggleSave={() => toggleSave(open)}
            onOpenStock={() => {
              const sym = open.symbol;
              setOpen(null);
              navigate(`/stock?symbol=${encodeURIComponent(sym)}&ex=NSE`);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function ScoreRing({ score }: { score: number }) {
  const tone = score >= 70 ? 'text-emerald-700 border-emerald-600' : score >= 50 ? 'text-sky-700 border-sky-500' : 'text-slate-500 border-slate-300';
  return (
    <span className={cn('keep-round flex h-10 w-10 shrink-0 items-center justify-center border-2 text-xs font-bold tabular-nums', tone)}>
      {score}
    </span>
  );
}

function StockDetail({
  s,
  saved,
  onToggleSave,
  onOpenStock,
}: {
  s: SwingStock;
  saved: boolean;
  onToggleSave: () => void;
  onOpenStock: () => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-muted">{s.name}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold text-ink tabular-nums">{inr(s.close)}</span>
          <span className={cn('text-sm font-medium', s.changePct >= 0 ? 'text-emerald-700' : 'text-red-600')}>
            {s.changePct >= 0 ? '+' : ''}
            {s.changePct.toFixed(2)}%
          </span>
          <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold', SETUP_STYLE[s.setup])}>
            {SETUP_LABEL[s.setup]} · {s.score}/100
          </span>
        </div>
      </div>

      {s.series && s.series.c.length > 1 && <MiniChart s={s} />}

      {s.setup !== 'none' && (
        <div className="space-y-1.5">
          <p className="text-sm font-semibold text-ink">Why it shows up</p>
          <p className="text-[13px] text-muted">{SETUP_HELP[s.setup]}</p>
          <ul className="list-disc space-y-0.5 pl-5 text-[13px] text-ink-2">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {s.plan && (
        <div className="rounded-xl border border-line p-3">
          <p className="text-sm font-semibold text-ink">Illustrative long plan</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <Level label="Entry" value={inr(s.plan.entry)} />
            <Level label={`Stop (-${s.plan.riskPct}%)`} value={inr(s.plan.stop)} tone="text-red-600" />
            <Level label={`Target (${s.plan.rr}R)`} value={inr(s.plan.target)} tone="text-emerald-700" />
          </div>
          <p className="mt-2 text-[11px] text-faint">
            Stop sits under the 10-day low or 1.5× ATR, whichever is lower (max 8% risk). Target is 2× the risk.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <Stat label="RSI (14)" value={s.rsi != null ? String(s.rsi) : '–'} />
        <Stat label="Volume vs 20-day avg" value={s.relVol != null ? `${s.relVol}×` : '–'} />
        <Stat label="20-day average" value={s.ema20 != null ? inr(s.ema20) : '–'} />
        <Stat label="50-day average" value={s.ema50 != null ? inr(s.ema50) : '–'} />
        <Stat label="200-day average" value={s.sma200 != null ? inr(s.sma200) : '–'} />
        <Stat label="52-week high" value={inr(s.high52)} />
        <Stat label="Below 52-week high" value={`${belowHigh(s).toFixed(1)}%`} />
        <Stat label="ATR (14)" value={s.atr != null ? inr(s.atr) : '–'} />
        <Stat label="MACD histogram" value={s.macdHist != null ? String(s.macdHist) : '–'} />
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onOpenStock}
          className="tap-scale h-10 flex-1 rounded-full bg-primary-soft text-sm font-semibold text-primary-ink"
        >
          Open stock page
        </button>
        <button
          type="button"
          onClick={onToggleSave}
          aria-pressed={saved}
          className="tap-scale inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full border border-line text-sm font-medium text-ink hover:bg-surface-hover"
        >
          <Bookmark size={15} className={saved ? 'fill-current text-primary-ink' : ''} />
          {saved ? 'Saved' : 'Save to watchlist'}
        </button>
      </div>
    </div>
  );
}

function Level({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] text-muted">{label}</p>
      <p className={cn('text-sm font-semibold tabular-nums', tone ?? 'text-ink')}>{value}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-line-soft pb-1">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-ink tabular-nums">{value}</span>
    </div>
  );
}

/** Last 60 sessions: price line with 20/50-day averages and the plan's stop / target levels. */
function MiniChart({ s }: { s: SwingStock }) {
  const { c, e20, e50 } = s.series!;
  const W = 320;
  const H = 130;
  const vals = [...c, ...e20, ...e50, s.plan?.stop, s.plan?.target].filter((v): v is number => typeof v === 'number');
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (i: number) => (i / Math.max(1, c.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / Math.max(1e-9, hi - lo)) * (H - 12);
  const path = (arr: (number | null)[]) =>
    arr.reduce<string>((d, v, i) => (v == null ? d : `${d}${d ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`), '');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${s.symbol} last 60 sessions`}>
      {s.plan && (
        <>
          <line x1="0" x2={W} y1={y(s.plan.target)} y2={y(s.plan.target)} stroke="#15803d" strokeDasharray="4 3" strokeWidth="1" />
          <line x1="0" x2={W} y1={y(s.plan.stop)} y2={y(s.plan.stop)} stroke="#dc2626" strokeDasharray="4 3" strokeWidth="1" />
        </>
      )}
      <path d={path(e50)} fill="none" stroke="#94a3b8" strokeWidth="1.5" />
      <path d={path(e20)} fill="none" stroke="#f59e0b" strokeWidth="1.5" />
      <path d={path(c)} fill="none" stroke="#237a4b" strokeWidth="2" />
      <text x="4" y="10" fontSize="9" fill="#64748b">
        — price  <tspan fill="#f59e0b">— 20d</tspan>  <tspan fill="#94a3b8">— 50d</tspan>
      </text>
    </svg>
  );
}
