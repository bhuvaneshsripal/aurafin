import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Card, EmptyState, LoadingState, PageHeader, SegmentedControl, cn } from '../components/ui';
import Modal from '../components/Modal';
import { readCache, writeCache } from '../utils/fetchCache';

type Setup = 'breakout' | 'pullback' | 'bounce' | 'none';

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
  stocks: SwingStock[];
  scanned: number;
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

type Filter = 'all' | Exclude<Setup, 'none'>;
const CACHE_NAME = 'swing-scan';
const inr = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function timeAgo(at: number): string {
  const m = Math.round(Math.max(0, Date.now() - at) / 60000);
  if (m < 1) return 'just now';
  return m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

/** Swing-trade scanner: ranks Nifty 200 stocks by simple, explainable technical setups. */
export default function SwingScanner() {
  const cached = useMemo(() => readCache<ScanData>(CACHE_NAME), []);
  const [data, setData] = useState<ScanData | null>(cached?.data ?? null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(cached?.at ?? null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<SwingStock | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 35_000);
      const res = await fetch('/api/market/swing', { signal: ctrl.signal }).finally(() => window.clearTimeout(t));
      const json = await res.json();
      if (!res.ok || !Array.isArray(json?.stocks)) throw new Error('bad response');
      const next: ScanData = { stocks: json.stocks, scanned: json.scanned, universe: json.universe };
      setData(next);
      setUpdatedAt(Date.now());
      setFailed(false);
      writeCache(CACHE_NAME, next);
    } catch {
      setFailed(true); // keep showing the last scan
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(() => {
    const c = { breakout: 0, pullback: 0, bounce: 0 };
    for (const s of data?.stocks ?? []) if (s.setup !== 'none') c[s.setup] += 1;
    return c;
  }, [data]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.stocks ?? []).filter((s) => {
      if (q) return s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q);
      return filter === 'all' ? s.setup !== 'none' : s.setup === filter;
    });
  }, [data, filter, query]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Swing scanner"
        description="Nifty 200 stocks ranked by technical swing setups (daily chart)"
        meta={
          updatedAt
            ? `Scanned ${data?.scanned ?? 0} stocks · ${timeAgo(updatedAt)}${failed ? ' · offline, showing last scan' : ''}`
            : undefined
        }
        actionsInline
        actions={
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Rescan"
            className="icon-outline-green tap-scale h-9 w-9 flex items-center justify-center"
          >
            <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
          </button>
        }
      />

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any stock in the scan"
          className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <SegmentedControl<Filter>
          size="sm"
          value={filter}
          onChange={setFilter}
          items={[
            { key: 'all', label: `All (${counts.breakout + counts.pullback + counts.bounce})` },
            { key: 'breakout', label: `Breakout (${counts.breakout})` },
            { key: 'pullback', label: `Pullback (${counts.pullback})` },
            { key: 'bounce', label: `Bounce (${counts.bounce})` },
          ]}
        />
      </div>

      {data === null && loading ? (
        <LoadingState label="Scanning the Nifty 200. This can take a few seconds" />
      ) : data === null ? (
        <EmptyState
          title="Couldn't run the scan"
          description="The market data source didn't respond. Try again in a moment."
          action={
            <button type="button" onClick={() => void load()} className="text-sm font-medium text-primary-ink hover:underline">
              Try again
            </button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState compact title="No stocks match" description="Try another setup or clear the search." />
      ) : (
        <Card padding="none" className="divide-y divide-line-soft">
          {rows.map((s) => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => setOpen(s)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover"
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
          ))}
        </Card>
      )}

      <p className="text-center text-[11px] text-faint">
        A mechanical screen on daily candles (Yahoo Finance), not a recommendation. Prices can be delayed.
        Entry, stop and target are illustrations; do your own research.
      </p>

      <Modal open={open !== null} onClose={() => setOpen(null)} title={open ? `${open.symbol} · swing view` : ''}>
        {open && <StockDetail s={open} />}
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

function StockDetail({ s }: { s: SwingStock }) {
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

      {s.series && <MiniChart s={s} />}

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
        <Stat label="ATR (14)" value={s.atr != null ? inr(s.atr) : '–'} />
        <Stat label="MACD histogram" value={s.macdHist != null ? String(s.macdHist) : '–'} />
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
