import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, Loader2, AlertTriangle, Info } from 'lucide-react';
import { Card, CardHeader, PageHeader, Button, Input, cn } from '../components/ui';
import { searchStockSymbols, type StockSearchResult } from '../utils/marketPrices';
import {
  computeValuation, epsCagr, fetchFundamentals, inr, signedPct,
  type FundamentalsResponse,
} from '../utils/valuation';

type Src = 'auto' | 'you';
const GROWTH_CAP = 25;
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));

function Field({ label, src, children }: { label: string; src?: Src; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="flex items-center justify-between text-xs text-muted mb-1">
        {label}
        {src && <span className={cn('text-[10px] px-1.5 rounded-full border', src === 'auto' ? 'border-brand-300 text-brand-700' : 'border-line')}>{src === 'auto' ? 'Auto' : 'Yours'}</span>}
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

  const [name, setName] = useState('');
  const [f, setF] = useState({ price: '', eps: '', growth: '', pe: '', years: '5', lookback: '10', exc: '0', dil: '0', req: '15', fy: '' });
  const [src, setSrc] = useState<Record<string, Src>>({});
  const [cyclical, setCyclical] = useState(false);
  const [weakPe, setWeakPe] = useState(false);
  const [roundEps, setRoundEps] = useState(false);
  const [growthNote, setGrowthNote] = useState('');
  const reqId = useRef(0);
  // Query text we set ourselves after a pick; the search effect must not reopen the list for it.
  const pickedRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

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
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setSuggestions([]);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
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
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFundamentals(symbol, ex);
      if (id !== reqId.current) return;
      setData(d);
      setName(d.name ?? d.symbol);
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
  const started = loading || data !== null || error !== null;
  const years = Math.round(num(f.years)) || 5;
  const maxBar = Math.max(num(f.price) || 0, result.levels.find((l) => l.key === 'X/2')?.target || 0);
  const hasPeData = data?.lowestPe;

  return (
    <div>
      <PageHeader
        title="X/2 · X/3 valuation"
        description="Search any NSE or BSE stock. Year-5 projected EPS × lowest historical P/E gives X; X/2 and X/3 are screening reference prices."
      />
      {started && <div className="mb-4 flex gap-2 rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-[13px] text-ink">
        <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />
        <span>A screening tool, not a complete valuation model. X/2 and X/3 are not fair values, targets or buy prices, and this is not investment advice.</span>
      </div>}

      <Card className="mb-4 relative overflow-visible">
        <div className="flex flex-col sm:flex-row gap-2">
          <div ref={boxRef} className="relative flex-1 min-w-0">
            <Input
              leftIcon={searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              placeholder="Search company or ticker, e.g. TCS, Reliance, HDFC Bank"
              value={query}
              onChange={(e) => { pickedRef.current = null; setQuery(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) load(query.trim());
                if (e.key === 'Escape') setSuggestions([]);
              }}
              aria-label="Search company or ticker"
            />
            {suggestions.length > 0 && (
              <ul className="absolute z-20 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-xl border border-line bg-surface shadow-lg">
                {suggestions.map((s) => (
                  <li key={s.symbol}>
                    <button type="button" onClick={() => pick(s.symbol)} className="w-full text-left px-3 py-2 hover:bg-surface-hover text-sm">
                      <span className="font-semibold">{s.symbol.replace(/\.(NS|BO)$/, '')}</span>
                      <span className="text-muted"> · {s.name}{s.exchDisp ? ` · ${s.exchDisp}` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <select value={exchange} onChange={(e) => setExchange(e.target.value as 'NSE' | 'BSE')} className="rounded-xl border border-line bg-surface px-3 min-h-10 text-sm" aria-label="Exchange">
            <option>NSE</option><option>BSE</option>
          </select>
          <Button onClick={() => query.trim() && load(query.trim())} loading={loading}>Get valuation</Button>
        </div>
        {error && <p className="mt-3 text-sm text-red-600">Couldn’t load data: {error}. You can still enter the figures below by hand.</p>}
        {data && (
          <p className="mt-3 text-xs text-muted">
            {name} · {exchange}:{data.symbol} · Source: {data.source} · Updated {new Date(data.asOf).toLocaleString('en-IN')}
          </p>
        )}
      </Card>

      {started && <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Assumptions" description="Every field is editable and the results update instantly." />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (₹)" src={src.price}><Input type="number" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
              <Field label="Current EPS, TTM (₹)" src={src.eps}><Input type="number" inputMode="decimal" value={f.eps} onChange={set('eps')} /></Field>
              <Field label="EPS growth / year (%)" src={src.growth}><Input type="number" inputMode="decimal" value={f.growth} onChange={set('growth')} /></Field>
              <Field label="Lowest historical P/E" src={src.pe}><Input type="number" inputMode="decimal" value={f.pe} onChange={set('pe')} /></Field>
              <Field label="Projection years"><Input type="number" min={1} max={10} value={f.years} onChange={set('years')} /></Field>
              <Field label="P/E lookback (years)" src={src.lookback}><Input type="number" min={1} value={f.lookback} onChange={set('lookback')} /></Field>
              <Field label="Exceptional items in EPS (₹)"><Input type="number" inputMode="decimal" value={f.exc} onChange={set('exc')} /></Field>
              <div className="col-span-2">
                <Field label={`Year-${Math.round(num(f.years)) || 5} EPS override (₹, optional)`}>
                  <Input type="number" inputMode="decimal" placeholder="e.g. analyst estimate; replaces growth %" value={f.fy} onChange={set('fy')} />
                </Field>
                <p className="mt-1 text-[11px] text-muted">The video’s formula starts from the 5th-year estimated EPS. If you have that figure (Screener, Tickertape, broker reports), enter it here and growth is derived from it{result.errors.length === 0 && f.fy.trim() !== '' && Number.isFinite(result.usedGrowthPct) ? `: ${result.usedGrowthPct.toFixed(1)}% a year` : ''}.</p>
              </div>
              <Field label="Required return / year (%)"><Input type="number" inputMode="decimal" value={f.req} onChange={set('req')} /></Field>
              <Field label="Share dilution / year (%)"><Input type="number" inputMode="decimal" value={f.dil} onChange={set('dil')} /></Field>
            </div>
            {growthNote && <p className="mt-3 text-xs text-muted flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0" />Growth: {growthNote}</p>}
            {hasPeData && data?.lowestPe && (
              <p className="mt-2 text-xs text-muted flex gap-1.5"><Info size={13} className="mt-0.5 shrink-0" />
                Lowest P/E {data.lowestPe.value.toFixed(2)} on {data.lowestPe.date}, from {data.lowestPe.points} positive reading(s) between {data.lowestPe.from} and {data.lowestPe.to} ({data.lowestPe.method}). Free data often covers only about 5 years.
              </p>
            )}
            {data && !hasPeData && <p className="mt-2 text-xs text-amber-700">Historical P/E isn’t available for this stock. Enter the lowest positive P/E from your own research.</p>}
            <div className="mt-3 space-y-1.5 text-sm">
              {([['Cyclical business', cyclical, setCyclical], ['Lowest P/E came from unusually weak earnings', weakPe, setWeakPe], ['Round EPS to ₹0.01 each year', roundEps, setRoundEps]] as const).map(([l, v, fn]) => (
                <label key={l} className="flex items-center gap-2"><input type="checkbox" checked={v} onChange={(e) => fn(e.target.checked)} />{l}</label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0">
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
              {result.warnings.map((w) => (
                <div key={w} className="rounded-xl border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[13px]">{w}</div>
              ))}
              {result.adequate && (
                <Card style={{ borderLeft: '4px solid #0b8a6a' }}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold text-muted">Current market price (CMP)</div>
                      <div className="text-2xl font-bold tabular-nums">
                        {num(f.price) > 0 ? inr(num(f.price)) : '—'}
                        {Number.isFinite(result.adequate.discountPct) && (
                          <span className={cn('ml-2 text-base font-semibold', result.lowConfidence ? 'text-amber-600' : result.adequate.discountPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            ({Math.abs(result.adequate.discountPct).toFixed(1)}% {result.adequate.discountPct >= 0 ? 'discount' : 'premium'}{result.lowConfidence ? ', unreliable' : ''})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold" style={{ color: '#0b8a6a' }}>Adequate buying price</div>
                      <div className="text-2xl font-bold tabular-nums">{inr(result.adequate.target)}</div>
                    </div>
                  </div>
                </Card>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {result.levels.filter((l) => l.key !== 'X').map((l) => (
                  <Card key={l.key} style={{ borderTop: `4px solid ${LEVEL_COLOR[l.key]}` }}>
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
                    <div key={r.k} className="flex items-center gap-3 text-sm">
                      <span className="w-12 shrink-0 text-muted">{r.k}</span>
                      <div className="flex-1 h-5 rounded bg-surface-muted overflow-hidden"><div className="h-full rounded" style={{ width: `${(r.v / maxBar) * 100}%`, background: r.c }} /></div>
                      <span className="w-28 text-right tabular-nums">{inr(r.v)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><div className="text-xs text-muted">Current P/E (price ÷ TTM EPS)</div><b>{result.currentPe ? result.currentPe.toFixed(1) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Lowest historical P/E ({f.lookback || '?'} yr)</div><b>{num(f.pe) ? num(f.pe).toFixed(2) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Year-{years} EPS</div><b>{inr(result.projected[years - 1])}</b></div>
                </div>
              </Card>

              <Card>
                <CardHeader title="EPS: actual vs projection" description="Year 0 is reported data; Years 1+ are forecasts from your assumptions." />
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                  <p className="mt-3 text-xs text-muted">Reported annual diluted EPS: {data.epsHistory.map((h) => `${h.date.slice(0, 4)}: ${inr(h.eps)}`).join(' · ')}</p>
                )}
              </Card>
              <p className="text-xs text-muted">Formula: X = Year-N EPS × lowest historical P/E (positive values only); X/2 = X ÷ 2; X/3 = X ÷ 3; upside % = (target − price) ÷ price × 100; discount % = (level − price) ÷ level × 100; adequate buying price = X ÷ (1 + required return)^years. The lowest historical P/E is a different figure from today’s P/E.</p>
            </>
          )}
        </div>
      </div>}
    </div>
  );
}
