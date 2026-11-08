import { SHORTCUT_HINT } from '../config/shortcuts';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Search, X, TrendingUp, Clock, LineChart, Star } from 'lucide-react';
import CompanyLogo from './CompanyLogo';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { subscribeSearchHistory, saveSearchHistory } from '../hooks/useFirestoreSync';
import { fmtPrice, fmtNum } from '../utils/stockDetail';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useModalBackClose } from '../hooks/useModalBackClose';
import { fetchLiveQuotes, searchStockSymbols, type LiveQuoteDetail } from '../utils/marketPrices';
import { readSavedStocks, toggleSavedStock, type SavedStock } from '../utils/savedStocks';
import { inToast } from '../utils/toastGuard';

const MAX_RECENT_SEARCHES = 5;
const RECENT_SEARCHES_KEY = 'aurafin-recent-searches';

/** A stock found by name/ticker on the market (not necessarily one the person holds). */
type StockHit = { symbol: string; name: string; market: 'IN' | 'US'; exch?: string };

const hitKey = (h: StockHit) => `${h.market}:${h.symbol.toUpperCase()}`;
const bareSymbol = (s: string) => s.replace(/\.(NS|BO)$/i, '');
/** Same key the stock page uses to fetch a live price. */
const quoteKeyFor = (h: StockHit) =>
  h.market === 'IN' && /\.BO$/i.test(h.symbol) ? `${bareSymbol(h.symbol).toUpperCase()}.BO` : bareSymbol(h.symbol).toUpperCase();

// A recent entry is a stock the person actually OPENED, never the text they typed.
// Stored as one string ("stock|market|symbol|exch|name") so the synced list stays string[].
const RECENT_PREFIX = 'stock|';
const encodeRecent = (h: StockHit) => [RECENT_PREFIX.slice(0, -1), h.market, h.symbol, h.exch ?? '', h.name].join('|');
function decodeRecent(entry: string): StockHit | null {
  if (!entry.startsWith(RECENT_PREFIX)) return null; // old typed-text entries are ignored
  const [, market, symbol, exch, ...rest] = entry.split('|');
  const name = rest.join('|');
  if ((market !== 'IN' && market !== 'US') || !symbol || !name) return null;
  return { market, symbol, exch: exch || undefined, name };
}
/** Keep only real stock entries (drops legacy typed words). */
const onlyStocks = (list: string[]) => list.filter((x) => decodeRecent(x) !== null);

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? onlyStocks(parsed.filter((x) => typeof x === 'string')).slice(0, MAX_RECENT_SEARCHES) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list: string[]) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // Best-effort — worst case the list just doesn't persist across reloads.
  }
}

/**
 * Global "Search Aurafin..." — searches everything the person has actually
 * entered (holdings, liabilities, goals, transactions) rather than app
 * navigation/menu items, since that's what's genuinely hard to relocate
 * once you have a few dozen of them. Opens from the search icon in the
 * Topbar; picking a result jumps straight to the right tab (and, for
 * holdings, pre-fills the Assets table's own search box via ?q=).
 */
export default function GlobalSearch({ variant = 'icon' }: { variant?: 'icon' | 'bar' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>(() => loadRecentSearches());
  // Market stocks (any listed stock, not just holdings) with their live prices.
  const [stocks, setStocks] = useState<StockHit[]>([]);
  const [stocksState, setStocksState] = useState<'idle' | 'loading' | 'failed' | 'done'>('idle');
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const [caretLeft, setCaretLeft] = useState(0);
  useLayoutEffect(() => {
    const w = measureRef.current?.offsetWidth ?? 0;
    const max = (inputRef.current?.clientWidth ?? 9999) - 3;
    setCaretLeft(Math.max(0, Math.min(w, max)));
  }, [query, inputFocused, open]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Phones: the panel sits between the top bar + index strip and the bottom nav
  // (which all stay visible) instead of covering the whole screen.
  const [mobileTop, setMobileTop] = useState<number | null>(null);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const uid = user?.uid;
  const isGuest = (user as { isAnonymous?: boolean } | null)?.isAnonymous === true;

  // Recent searches follow the account across devices: listen to the synced
  // list and mirror it locally (localStorage stays as the offline/guest copy).
  useEffect(() => {
    if (!user || isGuest) return;
    return subscribeSearchHistory(user, (items) => {
      if (!items) return;
      const next = onlyStocks(items).slice(0, MAX_RECENT_SEARCHES);
      setRecentSearches(next);
      saveRecentSearches(next);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, isGuest]);

  const persistRecent = (next: string[]) => {
    setRecentSearches(next);
    saveRecentSearches(next);
    if (user && !isGuest) void saveSearchHistory(user, next).catch(() => {});
  };

  // Which results are already on the Watchlist (for the star on each result).
  const [savedStocks, setSavedStocks] = useState<SavedStock[]>([]);
  useEffect(() => {
    if (open) setSavedStocks(readSavedStocks().slice(0, MAX_RECENT_SEARCHES));
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => {
      if (window.innerWidth >= 640) {
        setMobileTop(null);
        return;
      }
      const bar = document.getElementById('app-topbar')?.getBoundingClientRect();
      const strip = document.getElementById('app-marquee')?.getBoundingClientRect();
      const stripVisible = !!strip && strip.height > 0 && strip.width > 0;
      setMobileTop(Math.max(bar?.bottom ?? 56, stripVisible ? strip!.bottom : 0));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  useEffect(() => {
    if (open) {
      // Let the panel mount/animate in before stealing focus.
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    setQuery('');
  }, [open]);

  // Look the typed text up on the market: any stock, even one that isn't held.
  // Indian (NSE/BSE) matches first; US only when there are few Indian ones.
  const rawQ = query.trim();
  useEffect(() => {
    if (!open || rawQ.length < 3) {
      setStocks([]);
      setStocksState('idle');
      return;
    }
    let cancelled = false;
    setStocksState('loading');
    const t = window.setTimeout(async () => {
      // Ask the Indian and US lists at the same time (instead of one after the other),
      // and show the Indian matches as soon as they are in when there are enough.
      const inP = searchStockSymbols(rawQ, 'IN');
      const usP = searchStockSymbols(rawQ, 'US');
      const publish = (inRes: Awaited<typeof inP>, usRes: Awaited<typeof usP>) => {
        if (inRes === null && usRes === null) {
          setStocks([]);
          setStocksState('failed');
          return;
        }
        const seen = new Set<string>();
        const indian = new Set((inRes ?? []).map((r) => bareSymbol(r.symbol).toUpperCase()));
        const hits: StockHit[] = [
          ...(inRes ?? []).slice(0, 5).map((r) => ({ symbol: r.symbol, name: r.name, market: 'IN' as const, exch: r.exchDisp })),
          ...(usRes ?? [])
            .filter((r) => !/\.(NS|BO)$/i.test(r.symbol) && !indian.has(r.symbol.toUpperCase()))
            .slice(0, 3)
            .map((r) => ({ symbol: r.symbol, name: r.name, market: 'US' as const, exch: r.exchDisp })),
        ].filter((h) => {
          const k = `${h.market}:${bareSymbol(h.symbol).toUpperCase()}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        });
        setStocks(hits);
        setStocksState('done');
      };
      const inRes = await inP;
      if (cancelled) return;
      if (inRes !== null && inRes.length >= 3) {
        publish(inRes, []);
        return;
      }
      const usRes = await usP;
      if (cancelled) return;
      publish(inRes, usRes);
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [rawQ, open]);


  // Live price (CMP) + day change for the stocks found, shown on each row.
  const [quotes, setQuotes] = useState<Map<string, LiveQuoteDetail>>(new Map());
  const recentHits: { entry: string; hit: StockHit }[] = recentSearches
    .map((entry) => ({ entry, hit: decodeRecent(entry) }))
    .filter((r): r is { entry: string; hit: StockHit } => r.hit !== null);
  useEffect(() => {
    const list = [...stocks, ...recentHits.map((r) => r.hit)];
    if (!open || list.length === 0) return;
    let cancelled = false;
    const lookups = list.map((h) => ({ key: quoteKeyFor(h), market: h.market }));
    fetchLiveQuotes(lookups)
      .then((got) => {
        if (!cancelled) setQuotes((prev) => new Map([...prev, ...got]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [stocks, recentSearches, open]);

  const priceOf = (h: StockHit) => {
    const qd = quotes.get(quoteKeyFor(h));
    if (!qd) return { trailing: '', loading: true, sub: undefined as string | undefined, subColor: undefined as string | undefined };
    const prev = qd.previousClose;
    const diff = prev ? qd.price - prev : null;
    const pct = prev && diff !== null ? (diff / prev) * 100 : null;
    return {
      loading: false,
      trailing: fmtPrice(qd.price, h.market),
      sub: diff !== null && pct !== null ? `${diff >= 0 ? '+' : '-'}${fmtNum(Math.abs(diff), h.market)} (${Math.abs(pct).toFixed(2)}%)` : undefined,
      subColor: diff !== null && diff < 0 ? 'text-negative' : 'text-positive',
    };
  };

  // Keyboard shortcut: Ctrl+K (Cmd+K on Mac) opens the search, and closes it
  // again if it is already open. Works even while typing in a field, as in most
  // apps; skipped only when some other dialog is open.
  useEffect(() => {
    const onShortcut = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.shiftKey || e.altKey) return;
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'k') return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (inToast(e.target)) return;
      const t = e.target as Element | null;
      if (t?.closest?.('[data-global-search-trigger]')) return; // the trigger toggles it itself
      // On phones the top bar and bottom nav stay usable; tapping them leaves the search.
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  useBodyScrollLock(open);

  // Phone/PWA Back button while the search is open: close it and land on the Overview (main) page.
  useModalBackClose(open, () => {
    setOpen(false);
    navigate('/');
  });

  // Tapping the current tab while the search is open just closes the search (back to the
  // page's main view) instead of refreshing the page underneath it.
  useEffect(() => {
    if (!open) return;
    const onTabHome = (e: Event) => {
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener('aurafin:tab-home', onTabHome);
    return () => window.removeEventListener('aurafin:tab-home', onTabHome);
  }, [open]);

  // Tell the layout the search is open (the bottom nav stays visible, but stays shown above the keyboard).
  const setSearchOpen = useUiStore((s) => s.setSearchOpen);
  useEffect(() => {
    setSearchOpen(open);
    return () => setSearchOpen(false);
  }, [open, setSearchOpen]);

  const q = query.trim().toLowerCase();

  // Remembers a search term the person actually acted on (picked a result,
  // or hit Enter), most-recent-first, deduped case-insensitively, capped to
  // MAX_RECENT_SEARCHES — shown as quick-repeat suggestions the next time
  // the search is opened with nothing typed yet.
  const addRecentSearch = (hit: StockHit) => {
    const entry = encodeRecent(hit);
    const key = hitKey(hit);
    persistRecent(
      [entry, ...recentSearches.filter((t) => {
        const d = decodeRecent(t);
        return d !== null && hitKey(d) !== key;
      })].slice(0, MAX_RECENT_SEARCHES)
    );
  };

  const removeRecentSearch = (term: string) => {
    persistRecent(recentSearches.filter((t) => t !== term));
  };

  /** A stock result opens its own full page with the CMP. */
  const openStock = (h: StockHit) => {
    // Remember the stock that was picked (its name), never the text that was typed.
    addRecentSearch(h);
    goTo(
      `/stock?symbol=${encodeURIComponent(h.symbol)}&market=${h.market}&name=${encodeURIComponent(h.name)}&ex=${encodeURIComponent(
        h.market === 'US' ? 'US market' : /\.BO$/i.test(h.symbol) ? 'BSE' : h.exch || 'NSE'
      )}`
    );
  };

  // Keyboard: arrows move through the rows on screen, Enter opens the highlighted one.
  const navList: StockHit[] = q ? stocks : recentHits.map((r) => r.hit);
  // -1 = nothing highlighted until the person hovers a row or uses the arrow keys.
  const [activeIdx, setActiveIdx] = useState(-1);
  const navKey = `${open}|${q}|${navList.map(hitKey).join(',')}`;
  useEffect(() => setActiveIdx(-1), [navKey]);
  useEffect(() => {
    if (!open || activeIdx < 0) return;
    containerRef.current?.querySelector(`[data-nav-idx="${activeIdx}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx, open]);
  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (navList.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % navList.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? navList.length - 1 : i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = navList[Math.min(Math.max(activeIdx, 0), navList.length - 1)];
      if (hit) openStock(hit);
    }
  };
  const toggleStar = (h: StockHit) => {
    toggleSavedStock({ symbol: h.symbol, name: h.name, market: h.market, exchange: h.exch || 'NSE' });
    setSavedStocks(readSavedStocks().slice(0, MAX_RECENT_SEARCHES));
  };
  const isSaved = (h: StockHit) => savedStocks.some((x) => x.market === h.market && x.symbol.toUpperCase() === h.symbol.toUpperCase());

  const goTo = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {variant === 'bar' ? (
        <button
          type="button"
          data-global-search-trigger
          onClick={() => setOpen((o) => !o)}
          aria-label="Search Aurafin"
          className="group flex items-center gap-2 h-9 w-full max-w-sm px-3 rounded-lg border border-line bg-surface-muted text-sm text-faint hover:bg-surface hover:border-slate-300 transition-colors"
        >
          <Search size={16} className="text-muted shrink-0" />
          <span className="flex-1 text-left truncate">Search stocks</span>
        </button>
      ) : (
        <button
          type="button"
          data-global-search-trigger
          onClick={() => setOpen((o) => !o)}
          title={`Search Aurafin (${SHORTCUT_HINT.search})`}
          aria-label="Search Aurafin"
          className="tap-scale h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink shrink-0 transition-colors"
        >
          <Search size={18} />
        </button>
      )}

      {open && createPortal(
        <div
          className="animate-backdrop-in fixed inset-x-0 bottom-0 z-[35] sm:inset-0 sm:z-[100] sm:bg-slate-900/40 sm:backdrop-blur-[2px] sm:px-4 sm:pt-24 flex justify-center"
          style={mobileTop !== null ? { top: mobileTop } : undefined}
        >
          <div
            ref={containerRef}
            className="global-search-panel animate-menu-in w-full sm:max-w-xl bg-surface sm:rounded-3xl sm:shadow-2xl sm:border border-line overflow-hidden h-full sm:h-fit sm:max-h-[72vh] flex flex-col"
            style={{ transformOrigin: 'top center' }}
          >
            <div className="px-3 pt-3 pb-2 shrink-0 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Back"
                className="sm:hidden tap-scale h-9 w-9 flex items-center justify-center rounded-lg text-ink hover:bg-surface-hover shrink-0"
              >
                <ArrowLeft size={20} />
              </button>
              <div className="flex flex-1 min-w-0 items-center gap-2.5 h-9 px-2.5 rounded-lg bg-surface-muted border border-line focus-within:border-brand-500 focus-within:bg-surface transition-colors">
                <Search size={15} className="text-brand-500 shrink-0" />
                <div className="relative flex-1 min-w-0 h-6 flex items-center">
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder="Search stocks, e.g. ITC"
                    autoComplete="off"
                    spellCheck={false}
                    className="global-search-input w-full min-w-0 bg-transparent text-sm leading-6 text-ink placeholder:text-slate-400 caret-transparent"
                  />
                  {inputFocused && (
                    <>
                      <span
                        ref={measureRef}
                        aria-hidden
                        className="global-search-input absolute invisible whitespace-pre text-sm pointer-events-none"
                      >
                        {query}
                      </span>
                      <span
                        aria-hidden
                        className="global-search-caret pointer-events-none absolute top-0.5 h-5 w-0.5 rounded-full bg-brand-500"
                        style={{ left: Math.min(caretLeft, 9999) }}
                      />
                    </>
                  )}
                </div>
                {query && (
                  <button
                    onClick={() => setQuery('')}
                    aria-label="Clear search"
                    className="tap-scale h-6 w-6 flex items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 shrink-0"
                  >
                    <X size={13} />
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="hidden sm:flex tap-scale h-6 items-center justify-center rounded-md border border-line bg-surface px-1.5 text-[11px] font-medium text-slate-500 shrink-0"
                >
                  Esc
                </button>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="sm:hidden tap-scale h-9 w-9 flex items-center justify-center rounded-lg text-brand-600 hover:bg-surface-hover shrink-0"
              >
                <X size={20} />
              </button>
            </div>

            <div className="overflow-y-auto pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-2 flex-1 min-h-0 sm:flex-none">
              {!q ? (
                navList.length > 0 ? (
                  <div>
                    {recentHits.length > 0 && (
                      <ResultGroup
                        label="Recently opened"
                        icon={Clock}
                        iconColor="text-slate-500"
                        action={
                          <button
                            onClick={() => persistRecent([])}
                            className="text-[11px] font-medium text-slate-500 hover:text-ink normal-case"
                          >
                            Clear all
                          </button>
                        }
                      >
                        {recentHits.map((r, j) => {
                          const i = j;
                          const pr = priceOf(r.hit);
                          return (
                            <ResultRow
                              key={r.entry}
                              idx={i}
                              active={activeIdx === i}
                              hit={r.hit}
                              q=""
                              price={pr}
                              onHover={() => setActiveIdx(i)}
                              onClick={() => openStock(r.hit)}
                              onRemove={() => removeRecentSearch(r.entry)}
                            />
                          );
                        })}
                      </ResultGroup>
                    )}
                  </div>
                ) : (
                  <div className="px-6 py-10 text-center">
                    <div className="mx-auto mb-3 h-11 w-11 rounded-full bg-surface-muted flex items-center justify-center">
                      <Search size={20} className="text-slate-400" />
                    </div>
                    <p className="text-sm font-medium text-ink">Search any stock</p>
                    <p className="mt-1 text-xs text-slate-500">See its live price, chart, financials and more.</p>
                  </div>
                )
              ) : rawQ.length < 3 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-500">Type at least 3 letters to search stocks.</div>
              ) : stocks.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-slate-500">
                  {stocksState === 'loading' ? (
                    <div className="px-2 space-y-3 text-left" aria-label="Searching stocks">
                      {[0, 1, 2].map((n) => (
                        <div key={n} className="flex items-center gap-3 animate-pulse">
                          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-2.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
                          </div>
                          <div className="h-3 w-14 rounded bg-slate-200 dark:bg-slate-700" />
                        </div>
                      ))}
                    </div>
                  ) : stocksState === 'failed' ? (
                    <>Couldn’t reach the stock search. Check your connection and try again.</>
                  ) : (
                    <>
                      No stocks found for <span className="font-medium text-ink">“{rawQ}”</span>. Try the company name or its ticker.
                    </>
                  )}
                </div>
              ) : (
                <ResultGroup label="Stocks" icon={LineChart} iconColor="text-accent-600">
                  {stocks.map((h, i) => {
                    const pr = priceOf(h);
                    return (
                      <ResultRow
                        key={hitKey(h)}
                        idx={i}
                        active={activeIdx === i}
                        hit={h}
                        q={rawQ}
                        price={pr}
                        saved={isSaved(h)}
                        onToggleSave={() => toggleStar(h)}
                        onHover={() => setActiveIdx(i)}
                        onClick={() => openStock(h)}
                      />
                    );
                  })}
                </ResultGroup>
              )}
            </div>

          </div>
        </div>,
        document.body
      )}
    </>
  );
}

function ResultGroup({
  label,
  icon: Icon,
  iconColor,
  action,
  children,
}: {
  label: string;
  icon: typeof TrendingUp;
  iconColor: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 pt-2 pb-1">
      <div className="px-3 pb-1 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-slate-500">
          <Icon size={12} className={iconColor} />
          {label}
        </p>
        {action}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Wraps the part of `text` that matches what was typed. */
function Highlight({ text, q }: { text: string; q: string }) {
  const needle = q.trim();
  if (!needle) return <>{text}</>;
  const at = text.toLowerCase().indexOf(needle.toLowerCase());
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-amber-200/70 dark:bg-amber-400/25 text-inherit px-0.5 -mx-0.5">{text.slice(at, at + needle.length)}</mark>
      {text.slice(at + needle.length)}
    </>
  );
}

function ResultRow({
  idx,
  active,
  hit,
  q,
  price,
  saved,
  onToggleSave,
  onRemove,
  onHover,
  onClick,
}: {
  idx: number;
  active: boolean;
  hit: StockHit;
  q: string;
  price: { trailing: string; loading: boolean; sub?: string; subColor?: string };
  saved?: boolean;
  onToggleSave?: () => void;
  onRemove?: () => void;
  onHover: () => void;
  onClick: () => void;
}) {
  const exch = hit.market === 'US' ? 'US' : /\.BO$/i.test(hit.symbol) ? 'BSE' : hit.exch || 'NSE';
  return (
    <div
      data-nav-idx={idx}
      onMouseEnter={onHover}
      className={`group flex items-center gap-1 rounded-xl pr-1.5 transition-colors ${active ? 'bg-surface-hover' : ''}`}
    >
      <button onClick={onClick} className="flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left">
        <CompanyLogo symbol={bareSymbol(hit.symbol)} name={hit.name} market={hit.market} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-ink truncate">
            <Highlight text={hit.name} q={q} />
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
            <span className="truncate">{bareSymbol(hit.symbol)}</span>
            <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold bg-surface-muted border border-line text-slate-500">{exch}</span>
          </span>
        </span>
        <span className="shrink-0 text-right">
          {price.loading ? (
            <span className="block h-3.5 w-14 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          ) : (
            <>
              <span className="block text-sm font-semibold text-ink font-numeric">{price.trailing}</span>
              {price.sub && <span className={`block text-[11px] font-medium ${price.subColor}`}>{price.sub}</span>}
            </>
          )}
        </span>
      </button>
      {onToggleSave && (
        <button
          onClick={onToggleSave}
          aria-label={saved ? 'Remove from saved' : 'Save stock'}
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-full text-slate-400 hover:text-amber-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <Star size={15} className={saved ? 'fill-amber-400 text-amber-500' : ''} />
        </button>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label="Remove from recent"
          className="tap-scale h-7 w-7 flex items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0 sm:opacity-0 sm:group-hover:opacity-100"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}
