import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Loader2, ChevronDown, X, Star } from 'lucide-react';
import { Card, CardHeader, PageHeader, Button, Input, CardSkeleton, Badge, cn } from '../components/ui';
import ValuationBar from '../components/ValuationBar';
import ValuationWatchlist, { readWatchlist, writeWatchlist, cleanWatchlist, type WatchItem } from '../components/ValuationWatchlist';
import InfoTip from '../components/ui/InfoTip';
import { searchStockSymbols, type StockSearchResult } from '../utils/marketPrices';
import { useAuthStore } from '../store/authStore';
import { useModalBackClose } from '../hooks/useModalBackClose';
import { subscribeValuationHistory, saveValuationHistory, subscribeValuationWatchlist, saveValuationWatchlist } from '../hooks/useFirestoreSync';
import { useWatchlistRefresh, type WatchUpdate } from '../hooks/useWatchlistRefresh';
import {
  computeValuation, currencySymbol, deriveAutoInputs, fetchFundamentals, money, signedPct,
  type EpsAnalysis, type Exchange, type FundamentalsResponse,
} from '../utils/valuation';
import { inToast } from '../utils/toastGuard';

type Src = 'auto' | 'you';
const HISTORY_KEY = 'aurafin.valuation.history';
const HISTORY_MAX = 5;
/** Recent-search chips shown before "+ N more". */
const CHIPS_SHOWN = 3;
const EMPTY_FORM = { price: '', eps: '', growth: '', pe: '', years: '5', lookback: '10', exc: '0', dil: '0', req: '15', fy: '' };
type HistoryItem = { symbol: string; name: string; exchange: Exchange };
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
/** Give up on a symbol lookup after this long and report it as unreachable. */
const SEARCH_TIMEOUT_MS = 10_000;

function Field({ label, src, hint, children }: { label: string; src?: Src; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="flex items-start justify-between gap-1.5 text-xs text-muted mb-1 leading-snug">
        {label}
        {src && <span className={cn('shrink-0 text-[10px] px-1.5 rounded-full border', src === 'auto' ? 'border-brand-300 text-brand-700' : 'border-line')}>{src === 'auto' ? 'Auto' : 'Yours'}</span>}
      </span>
      {children}
      {hint && <span className="block mt-1 text-[11px] leading-snug text-muted break-words">{hint}</span>}
    </label>
  );
}

const monthYear = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const LEVEL_COLOR = { X: '#2b5fd9', 'X/2': '#0b8a6a', 'X/3': '#a8571c' } as const;

export default function Valuation() {
  const [query, setQuery] = useState('');
  const [exchange, setExchange] = useState<Exchange>('NSE');
  const isUS = exchange === 'US';
  const cur = currencySymbol(exchange);
  const fmt = (n: number) => money(n, exchange);
  const [suggestions, setSuggestions] = useState<StockSearchResult[]>([]);
  // What the last symbol lookup was for, and whether it failed. Lets the list say
  // "searching", "no matches" or "couldn't search" for the text in the box instead of
  // falling back to something unrelated (e.g. recent searches).
  const [lastSearch, setLastSearch] = useState<{ q: string; failed: boolean } | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FundamentalsResponse | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>(readHistory);
  const [watchlist, setWatchlist] = useState<WatchItem[]>(readWatchlist);
  const user = useAuthStore((st) => st.user);
  const userRef = useRef(user);
  userRef.current = user;

  // Save locally and to the account, so history shows on every device.
  const persistHistory = (h: HistoryItem[]) => {
    writeHistory(h);
    const u = userRef.current;
    if (u) saveValuationHistory(u, h).catch(() => { /* offline — local copy still saved */ });
  };

  // Pull the account's history (other devices) and keep it live.
  useEffect(() => {
    if (!user) return;
    return subscribeValuationHistory(user, (remote) => {
      if (remote === null) {
        // Nothing saved in the account yet: upload this device's history.
        const local = readHistory();
        if (local.length) saveValuationHistory(user, local).catch(() => {});
        return;
      }
      const clean = remote.filter((h) => h && typeof h.symbol === 'string').slice(0, HISTORY_MAX);
      setHistory(clean);
      writeHistory(clean);
    });
  }, [user]);

  // Watchlist: save locally and to the account, so it shows on every device.
  const persistWatchlist = (w: WatchItem[]) => {
    writeWatchlist(w);
    const u = userRef.current;
    if (u) saveValuationWatchlist(u, w).catch(() => { /* offline — local copy still saved */ });
  };

  // Pull the account's watchlist (saved on another device) and keep it live.
  useEffect(() => {
    if (!user) return;
    return subscribeValuationWatchlist(user, (remote) => {
      if (remote === null) {
        // Nothing saved in the account yet: upload what this device has.
        const local = readWatchlist();
        if (local.length) saveValuationWatchlist(user, local).catch(() => {});
        return;
      }
      const clean = cleanWatchlist(remote);
      setWatchlist(clean);
      writeWatchlist(clean);
    });
  }, [user]);
  const [f, setF] = useState(EMPTY_FORM);
  const [chipsExpanded, setChipsExpanded] = useState(false);
  const [src, setSrc] = useState<Record<string, Src>>({});
  const [cyclical, setCyclical] = useState(false);
  const [weakPe, setWeakPe] = useState(false);
  const [roundEps, setRoundEps] = useState(false);
  const [growthNote, setGrowthNote] = useState('');
  const [earnings, setEarnings] = useState<EpsAnalysis | null>(null);
  const reqId = useRef(0);
  // Query text we set ourselves after a pick; the search effect must not reopen the list for it.
  const [epsOpen, setEpsOpen] = useState(false); // EPS table starts collapsed; stays as the person leaves it
  const pickedRef = useRef<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Whether the dropdown under the search box (matches / status / recent searches) is open.
  const [listOpen, setListOpen] = useState(false);

  const set =(k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setSrc((p) => ({ ...p, [k]: 'you' }));
  };

  // Debounced symbol search (same endpoint the Add Asset form uses).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3 || q === pickedRef.current) { setSuggestions([]); setLastSearch(null); return; }
    let cancelled = false;
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      // A stalled connection must not leave "Searching…" on screen forever.
      const timeout = new Promise<null>((resolve) => { giveUp = setTimeout(() => resolve(null), SEARCH_TIMEOUT_MS); });
      Promise.race([searchStockSymbols(q, isUS ? 'US' : 'IN'), timeout]).then((r) => {
        clearTimeout(giveUp);
        if (cancelled) return; // a newer keystroke or a pick made this result stale
        // null = the lookup itself failed (offline, upstream down); [] = it worked but found nothing.
        setSuggestions(r ?? []);
        setLastSearch({ q, failed: r === null });
      });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); clearTimeout(giveUp); };
  }, [query, retryTick, isUS]);

  // Close the list when clicking anywhere outside the search box.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (inToast(e.target)) return;
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setListOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown as unknown as EventListener);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('touchstart', onDown as unknown as EventListener); };
  }, []);

  function pick(symbol: string) {
    const bare = symbol.replace(/\.(NS|BO)$/i, '');
    const ex: Exchange = isUS ? 'US' : /\.BO$/i.test(symbol) ? 'BSE' : 'NSE';
    pickedRef.current = bare;
    setSuggestions([]);
    setLastSearch(null);
    setQuery(bare);
    setExchange(ex);
    // Picking a match only fills the box. The valuation loads when "Get valuation" is pressed.
    setListOpen(false);
    inputRef.current?.blur();
  }

  // Phone/PWA Back button while a stock's valuation is showing: return to the main Valuation page
  // (empty search + saved watchlist) instead of leaving the page.
  useModalBackClose(!!data || loading, () => reset());

  /** Clear the search, the loaded stock and every assumption. */
  function reset() {
    reqId.current++;
    pickedRef.current = null;
    setQuery(''); setSuggestions([]); setLastSearch(null); setListOpen(false);
    setLoading(false); setError(null); setData(null); setEarnings(null);
    setF(EMPTY_FORM); setSrc({}); setCyclical(false); setWeakPe(false); setRoundEps(false); setGrowthNote('');
  }

  async function load(symbol: string, ex: Exchange = exchange) {
    const id = ++reqId.current;
    pickedRef.current = symbol.replace(/\.(NS|BO)$/i, '');
    setSuggestions([]);
    setListOpen(false);
    setLoading(true);
    setError(null);
    try {
      const d = await fetchFundamentals(symbol, ex);
      if (id !== reqId.current) return;
      setData(d);
      setHistory((prev) => {
        const next = [{ symbol: d.symbol, name: d.name ?? d.symbol, exchange: ex }, ...prev.filter((h) => !(h.symbol === d.symbol && h.exchange === ex))].slice(0, HISTORY_MAX);
        persistHistory(next);
        return next;
      });
      pickedRef.current = d.symbol;
      setQuery(d.symbol);
      const a = deriveAutoInputs(d);
      setEarnings(a.earnings);
      // Loss years / repeated sharp EPS falls: tick "Cyclical" for the person (they can untick it).
      setCyclical(a.cyclical);
      setGrowthNote(a.growthNote);
      setF((p) => ({
        ...p,
        price: a.price !== null ? String(a.price) : '',
        eps: a.eps !== null ? String(a.eps) : '',
        growth: a.growth !== null ? a.growth.toFixed(2) : '',
        pe: a.pe !== null ? a.pe.toFixed(2) : '',
        lookback: String(a.lookback),
        exc: '0', dil: '0', fy: '',
      }));
      setSrc({
        price: d.price !== null ? 'auto' : 'you', eps: d.ttmEps !== null ? 'auto' : 'you',
        growth: a.growth !== null ? 'auto' : 'you', pe: d.lowestPe ? 'auto' : 'you', lookback: d.lowestPe ? 'auto' : 'you',
      });
    } catch (e) {
      if (id !== reqId.current) return;
      setData(null);
      setEarnings(null);
      setError(e instanceof Error ? e.message : 'Could not load data');
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }

  // Opened from the global search ("/valuation?symbol=COALINDIA&ex=NSE"): load that stock straight away.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const sym = sp.get('symbol')?.trim();
    if (!sym) return;
    const exParam = (sp.get('ex') ?? '').toUpperCase();
    const ex: Exchange = exParam === 'US' || (sp.get('market') ?? '').toUpperCase() === 'US' ? 'US' : exParam === 'BSE' ? 'BSE' : 'NSE';
    setExchange(ex);
    void load(sym, ex);
    // Only on arrival; the address bar is left as is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const edited = Object.values(src).includes('you');
  // Some US-listed foreign companies (ADRs) report EPS in their home currency while the share is
  // priced in dollars. Price ÷ EPS is then meaningless, so say so rather than show a wrong X/2.
  const currencyReasons = useMemo(() => {
    const pc = data?.currency?.toUpperCase();
    const fc = data?.financialCurrency?.toUpperCase();
    return pc && fc && pc !== fc && src.eps === 'auto'
      ? [`The share is priced in ${pc} but the company reports earnings in ${fc}. EPS and P/E may not be comparable with the price, so treat X/2 and X/3 as unreliable and check the figures by hand.`]
      : [];
  }, [data, src.eps]);
  const result = useMemo(
    () => computeValuation({
      price: num(f.price), eps: num(f.eps), exceptional: num(f.exc) || 0, growthPct: num(f.growth),
      dilutionPct: num(f.dil) || 0, lowestPe: num(f.pe), years: num(f.years), lookbackYears: num(f.lookback), requiredReturnPct: num(f.req), finalYearEps: f.fy.trim() === '' ? undefined : num(f.fy),
      roundEps: roundEps, cyclical, weakPe, userProvided: !data || edited,
      peReadings: data?.lowestPe && src.pe === 'auto' ? data.lowestPe.points : undefined,
      peSpanYears: data?.lowestPe && src.pe === 'auto' ? data.lowestPe.spanYears : undefined,
      growthNote: src.growth === 'auto' ? growthNote : undefined,
      earnings,
      currencySymbol: cur,
      extraReasons: currencyReasons,
    }),
    [f, roundEps, cyclical, weakPe, data, edited, src, growthNote, earnings, cur, currencyReasons]
  );
  const peInfo = data?.lowestPe && src.pe === 'auto' ? data.lowestPe : null;

  // --- What the dropdown shows for the text in the box -------------------------------
  // Typing: matches for that text, or a plain "searching / no matches / couldn't search"
  // line. 
  const q = query.trim();
  const typing = q.length > 0 && q !== pickedRef.current; // searching, not a settled pick
  const longEnough = q.length >= 3;
  const searching = typing && longEnough && lastSearch?.q !== q;
  // Matches for an earlier, related text (still typing) stay up until the new lookup
  // answers; matches for unrelated text never do.
  const related = lastSearch !== null && (q.startsWith(lastSearch.q) || lastSearch.q.startsWith(q));
  const showSuggestions = listOpen && typing && longEnough && related && suggestions.length > 0;
  const notice: 'short' | 'searching' | 'failed' | 'empty' | null =
    !listOpen || !typing || showSuggestions ? null
    : !longEnough ? 'short'
    : lastSearch?.q !== q ? 'searching'
    : lastSearch.failed ? 'failed'
    : 'empty';
  // Until a stock is searched (or a lookup is running / failed), show nothing but the search box.
  const searchActive = showSuggestions || notice !== null;
  const started = loading || data !== null || error !== null;
  // Tapping the Valuation tab while a stock is open goes back to the main page
  // (the BottomNav only refreshes when this page is already on its main view).
  const homeRef = useRef<{ started: boolean; reset: () => void }>({ started: false, reset: () => {} });
  homeRef.current = { started, reset };
  useEffect(() => {
    const onHome = (e: Event) => {
      if (!homeRef.current.started) return;
      e.preventDefault();
      homeRef.current.reset();
    };
    window.addEventListener('aurafin:tab-home', onHome);
    return () => window.removeEventListener('aurafin:tab-home', onHome);
  }, []);

  const years = Math.round(num(f.years)) || 5;
  const maxBar = Math.max(num(f.price) || 0, result.levels.find((l) => l.key === 'X/2')?.target || 0);
  const hasPeData = data?.lowestPe;

  // --- Watchlist: saved stocks keep the numbers from their last valuation -------------
  const lvl = (k: string) => result.levels.find((l) => l.key === k)?.target ?? NaN;
  const priceV = num(f.price);
  const x2v = lvl('X/2');
  const x3v = lvl('X/3');
  const canSave = !!data && priceV > 0 && x2v > 0 && x3v > 0;
  const isSaved = !!data && watchlist.some((w) => w.symbol === data.symbol && w.exchange === exchange);
  // Always the newest list, so a background refresh never works from (or resurrects) an old copy.
  const watchlistRef = useRef(watchlist);
  watchlistRef.current = watchlist;
  const updateWatchlist = (next: WatchItem[]) => { watchlistRef.current = next; setWatchlist(next); persistWatchlist(next); };
  // Saved stocks are snapshots, so re-value any that are over 12 hours old (see useWatchlistRefresh).
  const mergeRefreshed = (updates: Map<string, WatchUpdate>) => {
    let changed = false;
    const next = watchlistRef.current.map((w) => {
      const u = updates.get(`${w.exchange}:${w.symbol}`);
      if (!u) return w;
      changed = true;
      return { ...w, ...u };
    });
    if (changed) updateWatchlist(next);
  };
  const { refreshing: watchRefreshing, refreshNow: refreshWatchlist } = useWatchlistRefresh(
    () => watchlistRef.current,
    mergeRefreshed,
    watchlist.map((w) => `${w.exchange}:${w.symbol}`).join(','),
  );
  const toggleSaved = () => {
    if (!data || !canSave) return;
    if (isSaved) {
      updateWatchlist(watchlist.filter((w) => !(w.symbol === data.symbol && w.exchange === exchange)));
    } else {
      updateWatchlist([{ symbol: data.symbol, name: data.name ?? data.symbol, exchange, price: priceV, x2: x2v, x3: x3v, savedAt: Date.now(), ...(edited ? { manual: true } : {}) }, ...watchlist]);
    }
  };
  // A saved stock that is valued again gets its numbers refreshed.
  useEffect(() => {
    if (!data || !canSave) return;
    setWatchlist((prev) => {
      const i = prev.findIndex((w) => w.symbol === data.symbol && w.exchange === exchange);
      if (i < 0) return prev;
      const cur = prev[i];
      if (cur.price === priceV && cur.x2 === x2v && cur.x3 === x3v && !!cur.manual === edited) return prev;
      const next = [...prev];
      // Firestore rejects `undefined`, so the flag is left out rather than set to undefined.
      const { manual: _was, ...rest } = cur;
      next[i] = { ...rest, price: priceV, x2: x2v, x3: x3v, savedAt: Date.now(), ...(edited ? { manual: true } : {}) };
      persistWatchlist(next);
      return next;
    });
  }, [data, canSave, exchange, priceV, x2v, x3v, edited]);

  return (
    <div>
      <PageHeader title="X/2 · X/3 valuation" />

      {searchActive && createPortal(
        <div
          aria-hidden="true"
          onClick={() => setListOpen(false)}
          className="animate-backdrop-in fixed inset-0 z-[45] bg-slate-900/40"
        />,
        document.body,
      )}

      <Card className={cn('mb-4 relative overflow-visible', searchActive && 'z-[46]')}>
        {/* Market switch: Indian (NSE/BSE, ₹) or US-listed ($) shares. Switching clears the page. */}
        <div role="group" aria-label="Market" className="mb-3 inline-flex rounded-full border border-line bg-surface-muted p-0.5">
          {([['India', 'NSE'], ['US', 'US']] as const).map(([label, ex]) => {
            const on = (ex === 'US') === isUS;
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => { if (on) return; reset(); setExchange(ex); }}
                className={cn(
                  'keep-round h-7 rounded-full px-3.5 text-xs font-semibold transition-colors',
                  on ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-muted hover:text-ink',
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <div ref={boxRef} className="relative flex-1 min-w-0">
            <Input
              leftIcon={searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
              ref={inputRef}
              placeholder="Search"
              value={query}
              onChange={(e) => { pickedRef.current = null; setListOpen(true); setQuery(e.target.value.toUpperCase()); }}
              onFocus={() => setListOpen(true)}
              onClick={() => setListOpen(true)}
              className="uppercase placeholder:normal-case pr-10 !rounded-full shadow-sm"
              autoCapitalize="characters"
              spellCheck={false}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && query.trim()) load(query.trim());
                if (e.key === 'Escape') setListOpen(false);
              }}
              aria-label="Search company or ticker"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { pickedRef.current = null; setQuery(''); setSuggestions([]); setLastSearch(null); setListOpen(true); inputRef.current?.focus(); }}
                className="absolute right-0 top-0 flex h-10 sm:h-9 w-10 items-center justify-center text-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            )}
            {searchActive && (
              <div
                data-testid="search-list"
                className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-auto overscroll-contain rounded-xl border border-line bg-surface shadow-lg"
              >
                {showSuggestions && (
                  <ul>
                    {suggestions.map((s) => (
                      <li key={s.symbol}>
                        <button type="button" onClick={() => pick(s.symbol)} className="w-full text-left px-3 py-2.5 hover:bg-surface-hover text-sm break-words">
                          <span className="font-semibold">{s.symbol.replace(/\.(NS|BO)$/, '')}</span>
                          <span className="text-muted"> · {s.name}{s.exchDisp ? ` · ${s.exchDisp}` : ''}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {notice && (
                  <div role="status" aria-live="polite" className="px-3 py-3 text-sm space-y-2">
                    {notice === 'short' && <p className="text-muted">Type at least 3 letters to search all stocks.</p>}
                    {notice === 'searching' && (
                      <p className="flex items-center gap-2 text-muted"><Loader2 size={14} className="animate-spin shrink-0" />Searching for “{q}”…</p>
                    )}
                    {notice === 'failed' && (
                      <p className="text-red-600">Couldn’t reach stock search — check your connection and try again.</p>
                    )}
                    {notice === 'empty' && (
                      <p className="text-muted">No matches for “{q}”. Try the company name instead — or it may be a very recent listing that hasn’t been indexed yet.</p>
                    )}
                    {(notice === 'failed' || notice === 'empty') && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 font-medium">
                        {notice === 'failed' && (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => { setLastSearch(null); setRetryTick((t) => t + 1); }}
                            className="text-brand-600 hover:text-brand-700"
                          >
                            Try again
                          </button>
                        )}
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => load(q)}
                          className="text-brand-600 hover:text-brand-700"
                        >
                          Try “{q}” anyway
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            <Button onClick={() => query.trim() && load(query.trim())} loading={loading} className="flex-1 sm:flex-none">Get valuation</Button>
            {started && <Button variant="secondary" onClick={reset} className="flex-1 sm:flex-none">Reset</Button>}
          </div>
        </div>
        {/* Recent stocks: tap one to reload it, no list to open. */}
        {history.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="Recent searches">
            {(chipsExpanded ? history : history.slice(0, CHIPS_SHOWN)).map((h) => (
              <button
                key={`${h.symbol}-${h.exchange}`}
                type="button"
                onClick={() => { setExchange(h.exchange); void load(h.symbol, h.exchange); }}
                className="keep-round inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-hover tap-scale"
              >
                {h.symbol}
              </button>
            ))}
            {!chipsExpanded && history.length > CHIPS_SHOWN && (
              <button
                type="button"
                onClick={() => setChipsExpanded(true)}
                className="keep-round inline-flex h-8 items-center rounded-full border border-line bg-surface px-3 text-[13px] font-medium text-muted transition-colors hover:bg-surface-hover"
              >
                + {history.length - CHIPS_SHOWN} more
              </button>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-600">Couldn’t load data: {error}. You can still enter the figures below by hand.</p>}
        {data && (
          <p className="mt-3 text-xs text-muted">
            Updated {new Date(data.asOf).toLocaleString('en-IN')}
          </p>
        )}
      </Card>

      {!started && (
        <ValuationWatchlist
          items={watchlist}
          onOpen={(w) => { setExchange(w.exchange); void load(w.symbol, w.exchange); }}
          onRemove={(w) => updateWatchlist(watchlist.filter((x) => !(x.symbol === w.symbol && x.exchange === w.exchange)))}
          onRefresh={() => void refreshWatchlist()}
          refreshing={watchRefreshing}
        />
      )}

      {started && <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4 min-w-0 order-2">
          <Card>
            <CardHeader title="Assumptions" description="Every field is editable and the results update instantly." />
            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
              <Field label={`Price (${cur})`} src={src.price}><Input type="number" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
              <Field label={`Current EPS, TTM (${cur})`} src={src.eps}><Input type="number" inputMode="decimal" value={f.eps} onChange={set('eps')} /></Field>
              <Field label="EPS growth / year (%)" src={src.growth} hint={src.growth === 'auto' ? growthNote : undefined}><Input type="number" inputMode="decimal" value={f.growth} onChange={set('growth')} /></Field>
              <Field
                label="Lowest historical P/E"
                src={src.pe}
                hint={peInfo ? `Low in ${monthYear(peInfo.date)}. ${peInfo.points} readings over ${peInfo.spanYears.toFixed(1)} years. Source: ${peInfo.method}.` : undefined}
              ><Input type="number" inputMode="decimal" value={f.pe} onChange={set('pe')} /></Field>
              <Field label="Projection years"><Input type="number" min={1} max={10} value={f.years} onChange={set('years')} /></Field>
              <Field label="P/E lookback (years)" src={src.lookback}><Input type="number" min={1} value={f.lookback} onChange={set('lookback')} /></Field>
              <Field label={`Exceptional items in EPS (${cur})`}><Input type="number" inputMode="decimal" value={f.exc} onChange={set('exc')} /></Field>
              <div className="min-[400px]:col-span-2">
                <Field label={`Year-${Math.round(num(f.years)) || 5} EPS override (${cur}, optional)`}>
                  <Input type="number" inputMode="decimal" placeholder="e.g. analyst estimate; replaces growth %" value={f.fy} onChange={set('fy')} />
                </Field>
              </div>
              <Field label="Required return / year (%)"><Input type="number" inputMode="decimal" value={f.req} onChange={set('req')} /></Field>
              <Field label="Share dilution / year (%)"><Input type="number" inputMode="decimal" value={f.dil} onChange={set('dil')} /></Field>
            </div>
            {data && !hasPeData && <p className="mt-2 text-xs text-amber-700">Historical P/E isn’t available for this stock. Enter the lowest positive P/E from your own research.</p>}
            <div className="mt-3 space-y-2 text-sm">
              {([['Cyclical business', cyclical, setCyclical], ['Lowest P/E came from unusually weak earnings', weakPe, setWeakPe], [`Round EPS to ${cur}0.01 each year`, roundEps, setRoundEps]] as const).map(([l, v, fn]) => (
                <label key={l} className="flex items-start gap-2.5 py-1 cursor-pointer"><input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={v} onChange={(e) => fn(e.target.checked)} /><span className="min-w-0">{l}</span></label>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4 min-w-0 order-1">
          {loading && <Card><CardSkeleton /></Card>}

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
              {!loading && result.levels.length > 0 && (
                <Card>
                  <ValuationBar
                    name={data?.name ?? (query.trim() || 'This stock')}
                    price={num(f.price)}
                    x2={result.levels.find((l) => l.key === 'X/2')?.target ?? NaN}
                    x3={result.levels.find((l) => l.key === 'X/3')?.target ?? NaN}
                    unreliable={result.lowConfidence}
                    exchange={exchange}
                  />
                  {canSave && (
                    <button
                      type="button"
                      onClick={toggleSaved}
                      aria-pressed={isSaved}
                      className={cn(
                        'keep-round mt-4 inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors tap-scale',
                        isSaved ? 'border-transparent bg-primary-soft text-primary-ink' : 'border-line bg-surface text-ink-2 hover:bg-surface-hover',
                      )}
                    >
                      <Star size={14} className={isSaved ? 'fill-current' : ''} />
                      {isSaved ? 'In watchlist' : 'Save to watchlist'}
                    </button>
                  )}
                </Card>
              )}
              {result.adequate && (
                <Card>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-sm font-semibold text-muted">
                        Current market price (CMP)
                        {(result.reasons.length > 0 || result.warnings.length > 0) && (
                          <InfoTip
                            size={16}
                            label={result.reasons.length > 0 ? 'Why these numbers may be unreliable' : 'Things to check'}
                            className={result.reasons.length > 0 ? '!text-amber-600' : ''}
                          >
                            <p className="font-semibold text-ink mb-1.5">{result.reasons.length > 0 ? 'Why these numbers may be unreliable' : 'Things to check'}</p>
                            <ul className="space-y-1.5">
                              {result.reasons.map((m) => <li key={m} className="text-amber-700">{m}</li>)}
                              {result.warnings.map((m) => <li key={m} className="text-muted">{m}</li>)}
                            </ul>
                          </InfoTip>
                        )}
                      </div>
                      <div className="text-2xl font-bold tabular-nums">
                        {num(f.price) > 0 ? fmt(num(f.price)) : '—'}
                        {Number.isFinite(result.adequate.discountPct) && (
                          <span className={cn('block sm:inline sm:ml-2 text-sm sm:text-base font-semibold', result.lowConfidence ? 'text-amber-600' : result.adequate.discountPct >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                            ({Math.abs(result.adequate.discountPct).toFixed(1)}% {result.adequate.discountPct >= 0 ? 'discount' : 'premium'}{result.lowConfidence ? ', unreliable' : ''})
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="sm:text-right border-t border-line pt-3 sm:border-0 sm:pt-0">
                      <div className="text-sm font-semibold" style={{ color: '#0b8a6a' }}>Adequate buying price</div>
                      <div className="text-2xl font-bold tabular-nums">{fmt(result.adequate.target)}</div>
                    </div>
                  </div>
                </Card>
              )}
              <Card>
                <div className="text-sm font-semibold" style={{ color: LEVEL_COLOR.X }}>X</div>
                <div className="text-2xl font-bold tabular-nums my-1">{fmt(result.x)}</div>
                <div className="text-xs text-muted">
                  Year-{years} EPS × lowest P/E = {result.projected[years - 1].toFixed(2)} × {num(f.pe).toFixed(2)}.
                  Adequate buying price = X ÷ (1 + {num(f.req)}%)^{years} = X ÷ {result.adequate?.factor.toFixed(2)}.
                </div>
              </Card>
              <div className="grid gap-3 sm:grid-cols-2">
                {result.levels.filter((l) => l.key !== 'X').map((l) => (
                  <Card key={l.key}>
                    <div className="text-sm font-semibold" style={{ color: LEVEL_COLOR[l.key] }}>{l.key}{l.key === 'X/2' ? ' (Target)' : ''}</div>
                    <div className="text-2xl font-bold tabular-nums my-1">{fmt(l.target)}</div>
                    <div className={cn('text-sm font-medium', l.upsidePct >= 0 ? 'text-emerald-600' : 'text-red-600')}>{signedPct(l.upsidePct)} vs price</div>
                    <div className="my-1">
                      {Number.isFinite(l.discountPct) ? (
                        <Badge variant={l.discountPct >= 0 ? 'success' : 'warning'} className="!rounded-full px-2.5">
                          {Math.abs(l.discountPct).toFixed(0)}% {l.discountPct >= 0 ? 'below' : 'above'}
                        </Badge>
                      ) : '—'}
                    </div>
                    <div className="text-xs text-muted">Difference: {Number.isFinite(l.diff) ? `${l.diff >= 0 ? '+' : '−'}${fmt(Math.abs(l.diff))}` : '—'}</div>
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
                      <span className="w-[5.5rem] sm:w-28 shrink-0 text-right tabular-nums text-[13px] sm:text-sm">{fmt(r.v)}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm [&>div:last-child]:col-span-2 sm:[&>div:last-child]:col-span-1">
                  <div><div className="text-xs text-muted">Current P/E (price ÷ TTM EPS)</div><b>{result.currentPe ? result.currentPe.toFixed(1) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Lowest historical P/E ({f.lookback || '?'} yr)</div><b>{num(f.pe) ? num(f.pe).toFixed(2) : '—'}</b></div>
                  <div><div className="text-xs text-muted">Year-{years} EPS</div><b>{fmt(result.projected[years - 1])}</b></div>
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
                      <tr className="border-t border-line"><td className="py-1.5">Year 0 (TTM)</td><td>Actual</td><td className="text-right tabular-nums">{fmt(result.baseEps)}</td><td className="text-right">—</td></tr>
                      {result.projected.map((v, i) => {
                        const p = i ? result.projected[i - 1] : result.baseEps;
                        return <tr key={i} className="border-t border-line"><td className="py-1.5">Year {i + 1}</td><td className="text-muted">Forecast</td><td className="text-right tabular-nums">{fmt(v)}</td><td className="text-right tabular-nums">{signedPct((v / p - 1) * 100)}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                {data && data.epsHistory.length > 0 && (
                  <p className="mt-3 text-xs text-muted break-words">Reported annual diluted EPS: {data.epsHistory.map((h) => `${h.date.slice(0, 4)}: ${fmt(h.eps)}`).join(' · ')}</p>
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
