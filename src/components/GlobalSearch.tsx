import { SHORTCUT_HINT } from '../config/shortcuts';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X, TrendingUp, Clock, LineChart, Loader2 } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useAuthStore } from '../store/authStore';
import { subscribeSearchHistory, saveSearchHistory } from '../hooks/useFirestoreSync';
import { fmtPrice, fmtNum } from '../utils/stockDetail';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { fetchLiveQuotes, searchStockSymbols, type LiveQuoteDetail } from '../utils/marketPrices';
import { readSavedStocks, type SavedStock } from '../utils/savedStocks';

const MAX_RECENT_SEARCHES = 5;
const RECENT_SEARCHES_KEY = 'aurafin-recent-searches';

/** A stock found by name/ticker on the market (not necessarily one the person holds). */
type StockHit = { symbol: string; name: string; market: 'IN' | 'US'; exch?: string };

const hitKey = (h: StockHit) => `${h.market}:${h.symbol.toUpperCase()}`;
const bareSymbol = (s: string) => s.replace(/\.(NS|BO)$/i, '');
/** Same key the stock page uses to fetch a live price. */
const quoteKeyFor = (h: StockHit) =>
  h.market === 'IN' && /\.BO$/i.test(h.symbol) ? `${bareSymbol(h.symbol).toUpperCase()}.BO` : bareSymbol(h.symbol).toUpperCase();

function loadRecentSearches(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string').slice(0, MAX_RECENT_SEARCHES) : [];
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
  const containerRef = useRef<HTMLDivElement>(null);
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
      const next = items.slice(0, MAX_RECENT_SEARCHES);
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

  // Stocks bookmarked on the stock page (read fresh each time the panel opens).
  const [savedStocks, setSavedStocks] = useState<SavedStock[]>([]);
  useEffect(() => {
    if (open) setSavedStocks(readSavedStocks().slice(0, MAX_RECENT_SEARCHES));
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
      const inRes = await searchStockSymbols(rawQ, 'IN');
      const usRes = inRes === null || inRes.length < 3 ? await searchStockSymbols(rawQ, 'US') : [];
      if (cancelled) return;
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
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [rawQ, open]);


  // Live price (CMP) + day change for the stocks found, shown on each row.
  const [quotes, setQuotes] = useState<Map<string, LiveQuoteDetail>>(new Map());
  useEffect(() => {
    const list = [...stocks, ...savedStocks.map((h) => ({ symbol: h.symbol, name: h.name, market: h.market, exch: h.exchange }))];
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
  }, [stocks, savedStocks, open]);

  const priceOf = (h: StockHit) => {
    const qd = quotes.get(quoteKeyFor(h));
    if (!qd) return { trailing: '›', sub: undefined as string | undefined, subColor: undefined as string | undefined };
    const prev = qd.previousClose;
    const diff = prev ? qd.price - prev : null;
    const pct = prev && diff !== null ? (diff / prev) * 100 : null;
    return {
      trailing: fmtPrice(qd.price, h.market),
      sub: diff !== null && pct !== null ? `${diff >= 0 ? '+' : '-'}${fmtNum(Math.abs(diff), h.market)} (${Math.abs(pct).toFixed(2)}%)` : undefined,
      subColor: diff !== null && diff < 0 ? 'text-red-500' : 'text-emerald-600',
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

  // Tell the layout the search is open so the mobile bottom nav / "+" button hide.
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
  const addRecentSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;
    persistRecent(
      [trimmed, ...recentSearches.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(
        0,
        MAX_RECENT_SEARCHES
      )
    );
  };

  const removeRecentSearch = (term: string) => {
    persistRecent(recentSearches.filter((t) => t !== term));
  };

  /** A stock result opens its own full page with the CMP. */
  const openStock = (h: StockHit) =>
    goTo(
      `/stock?symbol=${encodeURIComponent(h.symbol)}&market=${h.market}&name=${encodeURIComponent(h.name)}&ex=${encodeURIComponent(
        h.market === 'US' ? 'US market' : /\.BO$/i.test(h.symbol) ? 'BSE' : h.exch || 'NSE'
      )}`
    );

  const goTo = (path: string) => {
    addRecentSearch(query);
    setOpen(false);
    navigate(path);
  };

  return (
    <>
      {variant === 'bar' ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Search Aurafin"
          className="group flex items-center gap-2 h-9 w-full max-w-sm px-3 rounded-lg border border-line bg-surface-muted text-sm text-faint hover:bg-surface hover:border-slate-300 transition-colors"
        >
          <Search size={16} className="text-muted shrink-0" />
          <span className="flex-1 text-left truncate">Search stocks</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={`Search Aurafin (${SHORTCUT_HINT.search})`}
          aria-label="Search Aurafin"
          className="tap-scale h-9 w-9 flex items-center justify-center rounded-lg text-muted hover:bg-surface-hover hover:text-ink shrink-0 transition-colors"
        >
          <Search size={18} />
        </button>
      )}

      {open && (
        <div className="animate-backdrop-in fixed inset-0 z-[100] bg-slate-900/40 px-4 pt-[10vh] sm:pt-24 flex justify-center">
          <div
            ref={containerRef}
            className="global-search-panel animate-menu-in uppercase w-full max-w-lg bg-surface rounded-2xl shadow-xl border border-line overflow-hidden h-fit max-h-[70vh] flex flex-col"
            style={{ transformOrigin: 'top center' }}
          >
            <div className="flex items-center gap-3 px-4 py-4 border-b border-line-soft shrink-0">
              <Search size={20} className="text-brand-500 shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && query.trim()) addRecentSearch(query);
                }}
                placeholder="Search stocks..."
                className="global-search-input flex-1 min-w-0 bg-transparent text-base text-ink placeholder:text-slate-400"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="tap-scale h-8 w-8 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                >
                  <X size={16} />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="hidden sm:flex tap-scale h-7 items-center justify-center rounded-md border border-line px-2 text-[11px] font-medium text-slate-600 shrink-0"
              >
                Esc
              </button>
            </div>

            <div className="overflow-y-auto">
              {!q ? (
                recentSearches.length > 0 || savedStocks.length > 0 ? (
                  <div className="py-2">
                    {savedStocks.length > 0 && (
                      <ResultGroup label="Saved stocks" icon={LineChart} iconColor="text-accent-600">
                        {savedStocks.map((h) => (
                          <ResultRow
                            key={`${h.market}:${h.symbol}`}
                            title={h.name}
                            subtitle={`${bareSymbol(h.symbol)} · ${h.exchange}`}
                            trailing={priceOf({ symbol: h.symbol, name: h.name, market: h.market, exch: h.exchange }).trailing}
                            trailingColor={quotes.has(quoteKeyFor({ symbol: h.symbol, name: h.name, market: h.market })) ? 'text-ink' : 'text-slate-400'}
                            onClick={() => openStock({ symbol: h.symbol, name: h.name, market: h.market, exch: h.exchange })}
                          />
                        ))}
                      </ResultGroup>
                    )}
                    {recentSearches.length > 0 && (<>
                    <div className="px-4 pb-1 flex items-center justify-between">
                      <p className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
                        <Clock size={12} className="text-slate-600" />
                        Recent searches
                      </p>
                      <button
                        onClick={() => {
                          persistRecent([]);
                        }}
                        className="text-[11px] font-medium text-slate-600 hover:text-slate-600 dark:hover:text-slate-300"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="px-2">
                      {recentSearches.map((term) => (
                        <div
                          key={term}
                          className="group w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg hover:bg-surface-hover"
                        >
                          <Clock size={15} className="text-slate-300 dark:text-slate-600 shrink-0" />
                          <button
                            onClick={() => setQuery(term)}
                            className="flex-1 min-w-0 text-left text-sm font-medium text-ink-2 truncate"
                          >
                            {term}
                          </button>
                          <button
                            onClick={() => removeRecentSearch(term)}
                            className="tap-scale h-6 w-6 flex items-center justify-center rounded-full text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0 opacity-0 group-hover:opacity-100"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    </>)}
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-slate-600">
                    Search any stock to see its price and details.
                  </div>
                )
              ) : stocks.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-600">
                  {stocksState === 'loading' ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Searching stocks…
                    </span>
                  ) : stocksState === 'failed' ? (
                    <>Couldn’t reach the stock search. Check your connection and try again.</>
                  ) : (
                    <>
                      No results for <span className="font-medium text-slate-500 dark:text-slate-300">“{query}”</span>
                    </>
                  )}
                </div>
              ) : (
                <div className="py-2">
                  {(stocks.length > 0 || stocksState === 'loading') && (
                    <ResultGroup label="Stocks" icon={LineChart} iconColor="text-accent-600">
                      {stocks.map((h) => (
                        <ResultRow
                          key={hitKey(h)}
                          title={h.name}
                          subtitle={`${bareSymbol(h.symbol)} · ${h.market === 'US' ? 'US' : h.exch || 'NSE'}`}
                          trailing={priceOf(h).trailing}
                          trailingColor={quotes.has(quoteKeyFor(h)) ? 'text-ink' : 'text-slate-400'}
                          sub={priceOf(h).sub}
                          subColor={priceOf(h).subColor}
                          onClick={() => openStock(h)}
                        />
                      ))}
                      {stocksState === 'loading' && stocks.length === 0 && (
                        <p className="px-2.5 py-2 text-xs text-slate-500 normal-case">Searching stocks…</p>
                      )}
                    </ResultGroup>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ResultGroup({
  label,
  icon: Icon,
  iconColor,
  children,
}: {
  label: string;
  icon: typeof TrendingUp;
  iconColor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-2 py-1.5">
      <p className="px-2.5 pb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500">
        <Icon size={12} className={iconColor} />
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}

function ResultRow({
  title,
  subtitle,
  trailing,
  trailingColor = 'text-muted',
  sub,
  subColor = 'text-muted',
  onClick,
}: {
  title: string;
  subtitle: string;
  trailing: string;
  trailingColor?: string;
  /** Optional small line under the trailing value (e.g. day change). */
  sub?: string;
  subColor?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded-lg text-left hover:bg-surface-hover"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink truncate">
          {title}
        </span>
        <span className="block text-xs text-slate-600 truncate normal-case">{subtitle}</span>
      </span>
      <span className="shrink-0 text-right">
        <span className={`block text-sm font-medium ${trailingColor}`}>{trailing}</span>
        {sub && <span className={`block text-xs font-medium ${subColor}`}>{sub}</span>}
      </span>
    </button>
  );
}
