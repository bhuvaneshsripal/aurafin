import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, ChevronDown, History, X } from 'lucide-react';
import { Card, CardHeader, PageHeader, Button, Input, cn } from '../components/ui';
import { searchStockSymbols, type StockSearchResult } from '../utils/marketPrices';
import {
  computeValuation, epsCagr, fetchFundamentals, inr, signedPct,
  type FundamentalsResponse,
} from '../utils/valuation';

type Src = 'auto' | 'you';
const GROWTH_CAP = 25;
const HISTORY_KEY = 'aurafin.valuation.history';
const HISTORY_MAX = 5;
type HistoryItem = { symbol: string; name: string; exchange: 'NSE' | 'BSE' };
function readHistory(): HistoryItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
    return Array.isArray(v) ? v.filter((h) => h && typeof h.symbol === 'string').slice(0, HISTORY_MAX) : [];
  } catch { return []; }
}
function writeHistory(h: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch { /* storage unavailable */ }
}
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function Field({ label, src, children }: { label: string; src?: Src; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="flex items-start justify-between gap-1.5 text-xs text-muted mb-1 leading-snug">
        {label}
        {src && <span className={cn('shrink-0 text-[10px] px-1.5 rounded-full border', src === 'auto' ? 'border-brand-300 text-brand-700' : 'border-line')}>{src === 'auto' ? 'Auto' : 'Yours'}</span>}
      </span>
      {children}
    </label>
  );
}

const LEVEL_COLOR = { X: '#2b5fd9', 'X/2': '#0b8a6a', 'X/3': '#a8571c' } as const;

export default function Valuation() {
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState<'NSE' | 'BSE'>('NSE');
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FundamentalsResponse | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [f, setF] = useState({ price: '', eps: '', growth: '', pe: '', years: '5', lookback: '10', exc: '0', dil: '0', req: '15', fy: '' });
  const [src, setSrc] = useState<Record<string, Src>>({});
  const [cyclical, setCyclical] = useState(false);
  const [weakPe, setWeakPe] = useState(false);
  const [roundEps, setRoundEps] = useState(false);
  const [growthNote, setGrowthNote] = useState('');
  const reqId = useRef(0);
  // Query text we set ourselves after a pick; the search effect must not reopen the list for it.
  const [epsOpen, setEpsOpen] = useState(false); // EPS table starts collapsed; stays as the person leaves it
  const pickedRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setSrc((p) => ({ ...p, [k]: 'you' }));
  };

  // Debounced symbol search (same endpoint the Add Asset form uses).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === pickedRef.current) { setSuggestions([]); setSearching(false); return; }
    setSearching(true);
    let cancelled = false;
    const t = setTimeout(() => {
      searchStockSymbols(q, 'IN').then((r) => {
        if (cancelled) return; // a newer keystroke or a pick made this result stale
        setSuggestions(r ?? []);
        setSearching(false);
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Close the list when clicking anywhere outside the search box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) { setSuggestions([]); setHistoryOpen(false); }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown as unknown as EventListener);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown as unknown as EventListener); };
  }, []);

  function pick(symbol: string) {
    const bare = symbol.replace(/\.(NS|BO)$/i, '');
    const ex: 'NSE' | 'BSE' = /\.BO$/i.test(symbol) ? 'BSE' : 'NSE';
    pickedRef.current = bare;
    setSuggestions([]);
    setSearching(false);
    setQuery(bare);
    setExchange(ex);
    load(bare, ex);
  }

  async function load(symbol: string, ex: 'NSE' | 'BSE' = exchange) {
    const id = ++reqId.current;
    pickedRef.current = symbol.replace(/\.(NS|BO)$/i, '');
    setSuggestions([]);
    setHistoryOpen(false);
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFundamentals(symbol, ex);
      if (id !== reqId.current) return;
      setData(d);
      setHistory((prev) => {
        const next = [{ symbol: d.symbol, name: d.name ?? d.symbol, exchange: ex }, ...prev.filter((h) => !(h.symbol === d.symbol && h.exchange === ex))].slice(0, HISTORY_MAX);
        writeHistory(next);
        return next;
      });
      pickedRef.current = d.symbol;
      setQuery(d.symbol);
      const hist = d.epsHistory.map((h) => h.eps);
      const cagr = epsCagr(hist);
      let g: number | null = null;
      let note = '';
      if (d.growth.next5y !== null) { g = d.growth.next5y; note = 'Analyst 5-year EPS growth estimate (Yahoo Finance)'; }
      else if (d.growth.nextYear !== null) { g = d.growth.nextYear; note = 'Analyst next-year EPS growth estimate (Yahoo Finance); no 5-year estimate available'; }
      else if (cagr !== null) { g = cagr; note = `EPS CAGR over ${hist.length - 1} reported years (historical, not a forecast)`; }
      else note = 'No analyst or historical growth available. Enter your own assumption.';
      // A raw 3-4 year EPS CAGR from a tiny base can be 50%+; compounding that for 5 years wildly
      // inflates X. Cap the auto-filled value at 25% (you can still type any number).
      if (g !== null && g > GROWTH_CAP) { note += `; capped at ${GROWTH_CAP}% (raw value ${g.toFixed(1)}%)`; g = GROWTH_CAP; }
      setGrowthNote(note);
      const lb = d.lowestPe ? Math.max(0.1, Math.round(d.lowestPe.spanYears * 10) / 10) : 10;
      setF((p) => ({
        ...p,
        price: d.price !== null ? String(d.price) : '',
        eps: d.ttmEps !== null ? String(d.ttmEps) : '',
        growth: g !== null ? g.toFixed(2) : '',
        pe: d.lowestPe ? d.lowestPe.value.toFixed(2) : '',
        lookback: String(lb),
        exc: '0', dil: '0', fy: '',
      }));
      setSrc({
        price: d.price !== null ? 'auto' : 'you', eps: d.ttmEps !== null ? 'auto' : 'you',
        growth: g !== null ? 'auto' : 'you', pe: d.lowestPe ? 'auto' : 'you', lookback: d.lowestPe ? 'auto' : 'you',
      });
    } catch (e) {
      if (id !== reqId.current) return;
      setData(null);
      setError(e instanceof Error ? e.message : 'Could not load data');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  const edited = Object.values(src).includes('you');
  const result = useMemo(
    () => computeValuation({
      price: num(f.price), eps: num(f.eps), exceptional: num(f.exc) || 0, growthPct: num(f.growth),
      dilutionPct: num(f.dil) || 0, lowestPe: num(f.pe), years: num(f.years), lookbackYears: num(f.lookback), requiredReturnPct: num(f.req), finalYearEps: f.fy.trim() === '' ? undefined : num(f.fy),
      roundEps: roundEps, cyclical, weakPe, userProvided: !data || edited,
      peReadings: data?.lowestPe && src.pe === 'auto' ? data.lowestPe.points : undefined,
      peSpanYears: data?.lowestPe && src.pe === 'auto' ? data.lowestPe.spanYears : undefined,
      growthNote: src.growth === 'auto' ? growthNote : undefined,
    }),
    [f, roundEps, cyclical, weakPe, data, edited, src, growthNote]
  );

  // Until a stock is searched (or a lookup is running / failed), show nothing but the search box.
  const searchActive = historyOpen || suggestions.length > 0;
  const started = loading || data !== null || error !== null;
  const years = Math.round(num(f.years)) || 5;
  const maxBar = Math.max(num(f.price) || 0, result.levels.find((l) => l.key === 'X/2')?.target || 0);
  const hasPeData = data?.lowestPe;

  return (
    <div>
      <PageHeader title="X/2 · X/3 valuation" />

      {searchActive && createPortal(
        <div
          aria-hidden="true"
          onMouseDown={() => { setSuggestions([]); setHistoryOpen(false); }}
          onTouchStart={() => { setSuggestions([]); setHistoryOpen(false); }}
          className="animate-backdrop-in fixed inset-0 z-[45] bg-slate-900/40"
        />,
        document.body,
      )}

      <Card className={cn('mb-4 relative overflow-visible', searchActive && 'z-[46]')}>
        <div className="flex flex-col sm:flex-row gap-2">
          <div ref={boxRef} className="relative flex-1 min-w-0">
            <Input
              leftIcon={searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              ref={inputRef}
              placeholder="Search company or ticker, e.g. TCS"
              value={query}
              onChange={(e) => { pickedRef.current = null; setHistoryOpen(false); setQuery(e.target.value.toUpperCase()); }}
              onFocus={() => setHistoryOpen(true)}
              onClick={() => setHistoryOpen(true)}
              className="uppercase placeholder:normal-case pr-10"
              autoCapitalize="characters"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) load(query.trim());
                if (e.key === 'Escape') { setSuggestions([]); setHistoryOpen(false); }
              }}
              aria-label="Search company or ticker"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { pickedRef.current = null; setQuery(''); setSuggestions([]); setHistoryOpen(true); inputRef.current?.focus(); }}
                className="absolute right-0 top-0 flex h-10 sm:h-9 w-10 items-center justify-center text-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            )}
            {historyOpen && suggestions.length === 0 && history.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 overflow-hidden rounded-xl border border-line bg-surface shadow-lg">
                <div className="flex items-center justify-between px-3 pt-2 pb-1 text-xs text-muted">
                  <span className="flex items-center gap-1"><History size={13} />Recent searches</span>
                  <button type="button" onClick={() => { setHistory([]); writeHistory([]); setHistoryOpen(false); }} className="px-1 py-1 hover:text-ink">Clear all</button>
                </div>
                <ul>
                  {history.map((h) => (
                    <li key={`${h.symbol}-${h.exchange}`}>
                      <button
                        type="button"
                        onClick={() => { setQuery(h.symbol); setHistoryOpen(false); load(h.symbol, h.exchange); }}
                        className="w-full text-left px-3 py-2.5 hover:bg-surface-hover text-sm break-words"
                      >
                        <span className="font-semibold">{h.symbol}</span>
                        <span className="text-muted"> · {h.name} · {h.exchange}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {suggestions.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 max-h-60 sm:max-h-64 overflow-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.symbol}>
                    <button type="button" onClick={() => { setHistoryOpen(false); pick(s.symbol); }} className="w-full text-left px-3 py-2.5 hover:bg-surface-hover text-sm break-words">
                      <span className="font-semibold">{s.symbol.replace(/\.(NS|BO)$/, '')}</span>
                      <span className="text-muted"> · {s.name}{s.exchDisp ? ` · ${s.exchDisp}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Button onClick={() => query.trim() && load(query.trim())} loading={loading} className="w-full sm:w-auto shrink-0">Get valuation</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">Couldn’t load data: {error}. You can still enter the figures below by hand.</p>}
        {data && (
          <p className="mt-3 text-xs text-muted">
            Updated {new Date(data.asOf).toLocaleString('en-IN')}
          </p>
        )}
      </Card>

      {started && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 min-w-0 order-2">
          <Card>
            <CardHeader title="Assumptions" description="Every field is editable and the results update instantly." />
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
              <Field label="Price (₹)" src={src.price}><Input type="number" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
              <Field label="Current EPS, TTM (₹)" src={src.eps}><Input type="number" inputMode="decimal" value={f.eps} onChange={set('eps')} /></Field>
              <Field label="EPS growth / year (%)" src={src.growth}><Input type="number" inputMode="decimal" value={f.growth} onChange={set('growth')} /></Field>
              <Field label="Lowest historical P/E" src={src.pe}><Input type="number" inputMode="decimal" value={f.pe} onChange={set('pe')} /></Field>
              <Field label="Projection years"><Input type="number" min={1} max={10} value={f.years} onChange={set('years')} /></Field>
              <Field label="P/E lookback (years)" src={src.lookback}><Input type="number" min={1} value={f.lookback} onChange={set('lookback')} /></Field>
              <Field label="Exceptional items in EPS (₹)"><Input type="number" inputMode="decimal" value={f.exc} onChange={set('exc')} /></Field>
              <div className="min-[400px]:col-span-2">
                <Field label={`Year-${Math.round(num(f.years)) || 5} EPS override (₹, optional)`}>
                  <Input type="number" inputMode="decimal" placeholder="e.g. analyst estimate; replaces growth %" value={f.fy} onChange={set('fy')} />
                </Field>
              </div>
              <Field label="Required return / year (%)"><Input type="number" inputMode="decimal" value={f.req} onChange={set('req')} /></Field>
              <Field label="Share dilution / year (%)"><Input type="number" inputMode="decimal" value={f.dil} onChange={set('dil')} /></Field>
            </div>
            {data && !hasPeData && <p className="mt-2 text-xs text-amber-700">Historical P/E isn’t available for this stock. Enter the lowest positive P/E from your own research.</p>}
            <div className="mt-3 space-y-2 text-sm">
              {([['Cyclical business', cyclical, setCyclical], ['Lowest P/E came from unusually weak earnings', weakPe, setWeakPe], ['Round EPS to ₹0.01 each year', roundEps, setRoundEps]] as const).map(([l, v, fn]) => (
                <label key={l} className="flex items-start gap-2.5 py-1 cursor-pointer"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={v} onChange={(e) => fn(e.target.checked)} /><span className="min-w-0">{l}</span></label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0 order-1">
          {loading && <Card><div className="flex items-center gap-2 text-sm text-muted"><Loader2 size={16} className="animate-spin" />Loading fundamentals…</div></Card>}

          {result.errors.length > 0 && !data && !edited ? (
            // Nothing searched or typed yet: no red errors, just a calm prompt.
            !loading && (
              <Card>
                <p className="text-sm text-muted">Search for a stock above to see its X, X/2 and X/3 valuation.</p>
              </Card>
            )
          ) : result.errors.length > 0 ? (
            <Card>
              <p className="font-semibold mb-2">Valuation unavailable</p>
              {result.errors.map((m) => <p key={m} className="text-sm text-red-600 mb-1">{m}</p>)}
              <p className="text-xs text-muted mt-2">Search for a stock above, or fill in the assumptions.</p>
            </Card>
          ) : (
            <>
              {result.adequate && (
                <Card>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-muted">Current market price (CMP)</div>
                      <div className="text-2xl font-bold tabular-nums">
                        {num(f.price) > 0 ? inr(num(f.price)) : '—'}
                        {Number.isFinite(result.adequate.discountPct) && (
                          <span className={cn('block sm:inline sm:ml-2 text-sm sm:text-base font-semibold', result.lowConfidence ? 'text-amber-600' : result.adequate.discountPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            ({Math.abs(result.adequate.discountPct).toFixed(1)}% {result.adequate.discountPct >= 0 ? 'discount' : 'premium'}{result.lowConfidence ? ', unreliable' : ''})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sm:text-right border-t border-line pt-3 sm:border-0 sm:pt-0">
                      <div className="text-sm font-semibold" style={{ color: '#0b8a6a' }}>Adequate buying price</div>
                      <div className="text-2xl font-bold tabular-nums">{inr(result.adequate.target)}</div>
                    </div>
                  </div>
                </Card>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {result.levels.filter((l) => l.key !== 'X').map((l) => (
                  <Card key={l.key}>
                    <div className="text-sm font-semibold" style={{ color: LEVEL_COLOR[l.key] }}>{l.key} reference price</div>
                    <div className="text-2xl font-bold tabular-nums my-1">{inr(l.target)}</div>
                    <div className={cn('text-sm font-medium', l.upsidePct >= 0 ? 'text-emerald-600' : 'text-red-600')}>{signedPct(l.upsidePct)} vs price</div>
                    <div className={cn('text-sm', l.discountPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                      {Number.isFinite(l.discountPct) ? `${Math.abs(l.discountPct).toFixed(1)}% ${l.discountPct >= 0 ? 'discount' : 'premium'} at CMP` : '—'}
                    </div>
                    <div className="text-xs text-muted">Difference: {Number.isFinite(l.diff) ? `${l.diff >= 0 ? '+' : '−'}${inr(Math.abs(l.diff))}` : '—'}</div>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader title="Levels vs current price" />
                <div className="space-y-2">
                  {[{ k: 'Price', v: num(f.price), c: '#64748b' }, ...result.levels.filter((l) => l.key !== 'X').map((l) => ({ k: l.key, v: l.target, c: LEVEL_COLOR[l.key] }))].filter((r) => r.v > 0).map((r) => (
                    <div key={r.k} className="flex items-center gap-2 sm:gap-3 text-sm">
                      <span className="w-10 sm:w-12 shrink-0 text-muted">{r.k}</span>
                      <div className="flex-1 min-w-0 h-4 sm:h-5 rounded bg-surface-muted overflow-hidden"><div className="h-full rounded" style={{ width: `${(r.v / maxBar) * 100}%`, background: r.c }} /></div>
                      <span className="w-[5.5rem] sm:w-28 shrink-0 text-right tabular-nums text-[13px] sm:text-sm">{inr(r.v)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm [&>div:last-child]:col-span-2 sm:[&>div:last-child]:col-span-1">
                  <div><div className="text-xs text-muted">Current P/E (price ÷ TTM EPS)</div><b>{result.currentPe ? result.currentPe.toFixed(1) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Lowest historical P/E ({f.lookback || '?'} yr)</div><b>{num(f.pe) ? num(f.pe).toFixed(2) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Year-{years} EPS</div><b>{inr(result.projected[years - 1])}</b></div>
                </div>
              </Card>

              <Card>
                <button
                  type="button"
                  onClick={() => setEpsOpen((o) => !o)}
                  aria-expanded={epsOpen}
                  className="flex w-full items-center justify-between gap-3 text-left min-h-10"
                >
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold tracking-tight text-ink">EPS: actual vs projection</h2>
                  </div>
                  <ChevronDown size={20} className={cn('shrink-0 text-muted transition-transform', epsOpen && 'rotate-180')} />
                </button>
                {epsOpen && (
                  <div className="mt-4">
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[13px] sm:text-sm whitespace-nowrap">
                    <thead><tr className="text-muted text-left"><th className="py-1.5">Year</th><th>Type</th><th className="text-right">EPS</th><th className="text-right">YoY</th></tr></thead>
                    <tbody>
                      <tr className="border-t border-line"><td className="py-1.5">Year 0 (TTM)</td><td>Actual</td><td className="text-right tabular-nums">{inr(result.baseEps)}</td><td className="text-right">—</td></tr>
                      {result.projected.map((v, i) => {
                        const p = i ? result.projected[i - 1] : result.baseEps;
                        return <tr key={i} className="border-t border-line"><td className="py-1.5">Year {i + 1}</td><td className="text-muted">Forecast</td><td className="text-right tabular-nums">{inr(v)}</td><td className="text-right tabular-nums">{signedPct((v / p - 1) * 100)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                {data && data.epsHistory.length > 0 && (
                  <p className="mt-3 text-xs text-muted break-words">Reported annual diluted EPS: {data.epsHistory.map((h) => `${h.date.slice(0, 4)}: ${inr(h.eps)}`).join(' · ')}</p>
                )}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>}
    </div>
  );
}
