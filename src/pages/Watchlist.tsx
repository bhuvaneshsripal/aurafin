import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Bookmark, Check, ChevronRight, Copy, Download, ListPlus, MoreHorizontal, Pencil, Pin, Plus, Search, Trash2, X } from 'lucide-react';
import CompanyLogo from '../components/CompanyLogo';
import { Button, Card, DeltaChip, EmptyState, Field, IconButton, Input, PageHeader, Table, Tabs, TBody, Td, Textarea, Th, THead, Tr } from '../components/ui';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { fetchLiveQuotes, searchStockSymbols, type LiveQuoteDetail } from '../utils/marketPrices';
import { MAX_SAVED, readSavedStocks, readStockAlerts, toggleSavedStock, type SavedStock } from '../utils/savedStocks';
import { toast } from '../store/toastStore';
import { WATCHLIST_REMOTE_EVENT } from '../utils/watchlistSync';
import { csvCell, safeFilename, triggerDownload } from '../utils/exportCsv';
import { fetchStockHistory, fmtNum, fmtPrice, type Exchange } from '../utils/stockDetail';
import {
  MAX_LISTS,
  createList,
  deleteList,
  restoreList,
  duplicateList,
  moveKeyTo,
  pruneTo,
  readLists,
  readNotes,
  removeFromList,
  setNote,
  stockKey,
  toggleInList,
  togglePinList,
  updateList,
  type WatchList,
} from '../utils/watchlistLists';
import { inToast } from '../utils/toastGuard';
import { visibleInterval } from '../utils/visibleInterval';

const bare = (s: string) => s.replace(/\.(NS|BO)$/i, '');
// The stock page saves BSE stocks as the bare symbol + exchange "BSE", so check both (otherwise they were priced from NSE).
const isBse = (s: SavedStock) => s.market === 'IN' && (s.exchange === 'BSE' || /\.BO$/i.test(s.symbol));
const quoteKey = (s: SavedStock) => (isBse(s) ? `${bare(s.symbol).toUpperCase()}.BO` : bare(s.symbol).toUpperCase());
const skey = (s: SavedStock) => stockKey(s.market, s.symbol);
const exchangeOf = (s: SavedStock): Exchange => (isBse(s) ? 'BSE' : 'NSE');

type SortKey = 'manual' | 'name' | 'price' | 'change' | 'range';
const ALL = 'all';
const ALLSTOCKS = 'all-stocks';

/** A stock found on the whole market (not necessarily one already in the watchlist). */
interface MarketHit {
  symbol: string; // bare symbol, e.g. RELIANCE
  name: string;
  market: 'IN' | 'US';
  exchange: string; // 'NSE' | 'BSE' | 'US'
}
const hitQuoteKey = (h: MarketHit) => (h.market === 'IN' && h.exchange === 'BSE' ? `${h.symbol.toUpperCase()}.BO` : h.symbol.toUpperCase());

/** Trend + 52-week range per stock, fetched a few at a time and kept for the session. */
interface Shape {
  closes: number[];
  low: number;
  high: number;
}
const shapeCache = new Map<string, { at: number; shape: Shape | null }>();
const SHAPE_TTL = 30 * 60 * 1000;
const SHAPE_RETRY = 2 * 60 * 1000; // a failed fetch is retried soon, not after 30 minutes

function useShapes(stocks: SavedStock[]) {
  const [shapes, setShapes] = useState<Map<string, Shape>>(new Map());
  const sig = stocks.map(skey).join('|');
  useEffect(() => {
    let cancelled = false;
    const now = Date.now();
    const seed = new Map<string, Shape>();
    const todo: SavedStock[] = [];
    for (const s of stocks) {
      const c = shapeCache.get(skey(s));
      if (c && now - c.at < (c.shape ? SHAPE_TTL : SHAPE_RETRY)) {
        if (c.shape) seed.set(skey(s), c.shape);
      } else todo.push(s);
    }
    setShapes(seed);
    const worker = async () => {
      while (!cancelled && todo.length) {
        const s = todo.shift()!;
        let shape: Shape | null = null;
        try {
          const h = await fetchStockHistory(bare(s.symbol), s.market, exchangeOf(s), '1Y');
          const pts = h.points.filter((p) => Number.isFinite(p[4]));
          if (pts.length > 2) {
            shape = {
              closes: pts.slice(-14).map((p) => p[4]),
              low: Math.min(...pts.map((p) => (Number.isFinite(p[3]) ? p[3] : p[4]))),
              high: Math.max(...pts.map((p) => (Number.isFinite(p[2]) ? p[2] : p[4]))),
            };
          }
        } catch {
          /* leave this row without a trend */
        }
        shapeCache.set(skey(s), { at: Date.now(), shape });
        if (!cancelled && shape) setShapes((prev) => new Map(prev).set(skey(s), shape!));
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  return shapes;
}

/** Saved stocks as a table, grouped into your own lists, with notes, alerts, trend and 52-week range. */
export default function Watchlist() {
  const navigate = useNavigate();
  const [items, setItems] = useState<SavedStock[]>(() => readSavedStocks());
  const [lists, setLists] = useState<WatchList[]>(() => readLists());
  const [notes, setNotes] = useState<Record<string, string>>(() => readNotes());
  const [quotes, setQuotes] = useState<Map<string, LiveQuoteDetail>>(new Map());
  const [active, setActive] = useState<string>(() => {
    const ls = readLists();
    const first = ls.find((l) => l.pinned) ?? ls[0];
    return first ? first.id : ALL;
  });
  const [query, setQuery] = useState('');
  const [pickKey, setPickKey] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'manual', dir: 'asc' });
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [listModal, setListModal] = useState<null | 'new' | 'rename'>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pinMode, setPinMode] = useState(false);

  // Whole-market search: anything typed (3+ letters) is also looked up across all NSE/BSE/US stocks.
  const rawQ = query.trim();
  const [hits, setHits] = useState<MarketHit[]>([]);
  const [hitState, setHitState] = useState<'idle' | 'loading' | 'failed' | 'done'>('idle');
  const [hitQuotes, setHitQuotes] = useState<Map<string, LiveQuoteDetail>>(new Map());

  useEffect(() => {
    if (rawQ.length < 3) {
      setHits([]);
      setHitState('idle');
      return;
    }
    let cancelled = false;
    setHitState('loading');
    const t = window.setTimeout(async () => {
      const [inRes, usRes] = await Promise.all([searchStockSymbols(rawQ, 'IN'), searchStockSymbols(rawQ, 'US')]);
      if (cancelled) return;
      if (inRes === null && usRes === null) {
        setHits([]);
        setHitState('failed');
        return;
      }
      const seen = new Set<string>();
      const indian = new Set((inRes ?? []).map((r) => bare(r.symbol).toUpperCase()));
      const found: MarketHit[] = [
        ...(inRes ?? []).slice(0, 6).map((r) => ({
          symbol: bare(r.symbol),
          name: r.name,
          market: 'IN' as const,
          exchange: /\.BO$/i.test(r.symbol) || /bse|bombay/i.test(r.exchDisp ?? '') ? 'BSE' : 'NSE',
        })),
        ...(usRes ?? [])
          .filter((r) => !/\.(NS|BO)$/i.test(r.symbol) && !indian.has(r.symbol.toUpperCase()))
          .slice(0, 4)
          .map((r) => ({ symbol: r.symbol, name: r.name, market: 'US' as const, exchange: 'US' })),
      ].filter((h) => {
        const k = stockKey(h.market, h.symbol);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      setHits(found);
      setHitState('done');
      if (found.length) {
        fetchLiveQuotes(found.map((h) => ({ key: hitQuoteKey(h), market: h.market })))
          .then((got) => {
            if (!cancelled) setHitQuotes((prev) => new Map([...prev, ...got]));
          })
          .catch(() => {});
      }
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [rawQ]);

  const alerts = useMemo(() => new Map(readStockAlerts().map((a) => [stockKey(a.market, a.symbol), a])), []);
  const shapes = useShapes(items);

  const refreshLocal = () => {
    setItems(readSavedStocks());
    setLists(readLists());
    setNotes(readNotes());
  };

  // Another device changed the watchlist: re-read it from this device's storage.
  useEffect(() => {
    const onRemote = () => refreshLocal();
    window.addEventListener(WATCHLIST_REMOTE_EVENT, onRemote);
    return () => window.removeEventListener(WATCHLIST_REMOTE_EVENT, onRemote);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    pruneTo(new Set(items.map(skey)));
    setLists(readLists());
    setNotes(readNotes());
  }, [items]);

  const lookups = useMemo(() => items.map((s) => ({ key: quoteKey(s), market: s.market })), [items]);
  const load = useCallback(() => {
    if (lookups.length === 0) return () => {};
    let cancelled = false;
    fetchLiveQuotes(lookups)
      .then((got) => {
        if (!cancelled) setQuotes((prev) => new Map([...prev, ...got]));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [lookups]);
  useEffect(() => {
    let stop = load();
    const stopPoll = visibleInterval(() => {
      stop();
      stop = load();
    }, 60_000);
    return () => {
      stop();
      stopPoll();
    };
  }, [load]);

  const activeList = lists.find((l) => l.id === active) ?? null;
  const pinnedLists = useMemo(() => lists.filter((l) => l.pinned), [lists]);
  const sortedLists = useMemo(() => [...lists.filter((l) => l.pinned), ...lists.filter((l) => !l.pinned)], [lists]);
  useEffect(() => {
    if (active !== ALL && active !== ALLSTOCKS && !activeList) setActive(ALL);
  }, [active, activeList]);

  const pctOf = (s: SavedStock) => {
    const q = quotes.get(quoteKey(s));
    return q?.previousClose ? ((q.price - q.previousClose) / q.previousClose) * 100 : null;
  };
  const rangePos = (s: SavedStock) => {
    const q = quotes.get(quoteKey(s));
    const sh = shapes.get(skey(s));
    if (!q || !sh || sh.high <= sh.low) return null;
    return Math.max(0, Math.min(1, (q.price - sh.low) / (sh.high - sh.low)));
  };

  const visible = useMemo(() => {
    let rows = activeList
      ? activeList.keys.map((k) => items.find((s) => skey(s) === k)).filter((s): s is SavedStock => !!s)
      : [...items];
    const q = query.trim().toLowerCase();
    if (q) rows = rows.filter((s) => s.name.toLowerCase().includes(q) || bare(s.symbol).toLowerCase().includes(q));
    const val = (s: SavedStock): number | string | null => {
      if (sort.key === 'name') return s.name.toLowerCase();
      if (sort.key === 'price') return quotes.get(quoteKey(s))?.price ?? null;
      if (sort.key === 'change') return pctOf(s);
      if (sort.key === 'range') return rangePos(s);
      return null;
    };
    if (sort.key !== 'manual') {
      const m = sort.dir === 'asc' ? 1 : -1;
      rows.sort((a, b) => {
        const x = val(a);
        const y = val(b);
        if (x === null && y === null) return 0;
        if (x === null) return 1;
        if (y === null) return -1;
        return (x < y ? -1 : x > y ? 1 : 0) * m;
      });
    }
    return rows;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, activeList, query, sort, quotes, shapes]);

  const summary = useMemo(() => {
    const pcts = visible.map(pctOf).filter((p): p is number => p !== null);
    return {
      up: pcts.filter((p) => p > 0).length,
      down: pcts.filter((p) => p < 0).length,
      avg: pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : null,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, quotes]);

  const onSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? (s.dir === 'asc' ? { key, dir: 'desc' } : { key: 'manual', dir: 'asc' }) : { key, dir: key === 'name' ? 'asc' : 'desc' }));
  const thProps = (key: SortKey) => ({ sortable: true, active: sort.key === key, dir: sort.dir, onSort: () => onSort(key) });

  const open = (s: SavedStock) =>
    navigate(
      `/stock?symbol=${encodeURIComponent(s.symbol)}&market=${s.market}&name=${encodeURIComponent(s.name)}&ex=${encodeURIComponent(
        s.market === 'US' ? 'US market' : s.exchange || 'NSE'
      )}`
    );

  const removeEverywhere = (s: SavedStock) => {
    const k = skey(s);
    const inLists = readLists().filter((l) => l.keys.includes(k)).map((l) => l.id);
    const note = readNotes()[k];
    toggleSavedStock(s);
    setItems(readSavedStocks());
    setMenuKey(null);
    toast.undo(`${s.name} removed`, () => {
      toggleSavedStock(s);
      for (const id of inLists) if (readLists().some((l) => l.id === id)) toggleInList(id, k);
      if (note) setNote(k, note);
      refreshLocal();
    });
  };

  /** Adds a searched stock to the open list (saving it to the watchlist first), or to the watchlist on the All tab. Tapping again undoes it. */
  const hitInView = (h: MarketHit) => {
    const k = stockKey(h.market, h.symbol);
    return activeList ? activeList.keys.includes(k) : items.some((s) => skey(s) === k);
  };
  const toggleHit = (h: MarketHit) => {
    const k = stockKey(h.market, h.symbol);
    const stock: SavedStock = { symbol: h.symbol, name: h.name, market: h.market, exchange: h.exchange };
    const isSaved = items.some((s) => skey(s) === k);
    if (activeList) {
      if (activeList.keys.includes(k)) {
        const listId = activeList.id;
        removeFromList(listId, k);
        toast.undo(`${h.name} removed from ${activeList.name}`, () => {
          toggleInList(listId, k);
          refreshLocal();
        });
      } else {
        if (!isSaved) {
          if (items.length >= MAX_SAVED) {
            toast.error(`Watchlist is full (${MAX_SAVED} stocks). Remove one to add another.`);
            return;
          }
          toggleSavedStock(stock);
        }
        toggleInList(activeList.id, k);
        toast.success(`${h.name} added to ${activeList.name}`);
      }
    } else if (isSaved) {
      toggleSavedStock(stock);
      toast.undo(`${h.name} removed from Watchlist`, () => {
        toggleSavedStock(stock);
        refreshLocal();
      });
    } else {
      if (items.length >= MAX_SAVED) {
        toast.error(`Watchlist is full (${MAX_SAVED} stocks). Remove one to add another.`);
        return;
      }
      toggleSavedStock(stock);
      toast.success(`${h.name} added to Watchlist`);
    }
    refreshLocal();
  };

  const startCreate = () => {
    setNameDraft('');
    setListModal('new');
  };

  const submitList = () => {
    if (!nameDraft.trim()) return;
    if (listModal === 'rename' && activeList) updateList(activeList.id, { name: nameDraft.toUpperCase() });
    else {
      const l = createList(nameDraft.toUpperCase(), '');
      if (l) setActive(l.id);
    }
    setListModal(null);
    setNameDraft('');
    refreshLocal();
  };

  const exportCsv = () => {
    const rows = visible.map((s) => {
      const q = quotes.get(quoteKey(s));
      const p = pctOf(s);
      return [s.name, bare(s.symbol), s.market, q ? q.price : '', p !== null ? p.toFixed(2) : '', notes[skey(s)] ?? ''].map(csvCell).join(',');
    });
    const header = ['Name', 'Symbol', 'Market', 'Price', 'Change %', 'Note'].map(csvCell).join(',');
    // BOM so Excel reads ₹ and non-English names correctly; shared helper delays revoking the URL (Safari).
    const blob = new Blob(['\uFEFF', [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    triggerDownload(blob, `${safeFilename(activeList ? activeList.name : 'watchlist', 'watchlist')}.csv`);
  };

  const manualMovable = !!activeList && sort.key === 'manual' && !query;

  // Long-press a row, then drag it up/down to reorder (manual order inside a list).
  const [dragKey, setDragKey] = useState<string | null>(null);
  const suppressClick = useRef(false);
  const startLongPress = (e: React.PointerEvent, k: string) => {
    if (!manualMovable || !activeList || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const listId = activeList.id;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    const current = k;
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      window.removeEventListener('touchmove', block);
      if (dragging) {
        setDragKey(null);
        suppressClick.current = true;
        setTimeout(() => (suppressClick.current = false), 50);
      }
    };
    const block = (ev: TouchEvent) => {
      if (dragging) ev.preventDefault();
    };
    const onMove = (ev: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) > 8) cleanup();
        return;
      }
      const row = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest('tr[data-rowkey]');
      const target = row?.getAttribute('data-rowkey');
      if (target && target !== current) {
        moveKeyTo(listId, current, target);
        setLists(readLists());
      }
    };
    const onEnd = () => cleanup();
    const timer = window.setTimeout(() => {
      dragging = true;
      setDragKey(k);
      navigator.vibrate?.(15);
    }, 400);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
    window.addEventListener('touchmove', block, { passive: false });
  };

  // Any click outside an open menu (or Escape) closes it; that click is swallowed so it doesn't also open a stock.
  useEffect(() => {
    if (menuKey === null && !listMenu) return;
    const onClick = (e: MouseEvent) => {
      if (inToast(e.target)) return;
      if ((e.target as Element | null)?.closest?.('[data-wl-menu]')) return;
      e.stopPropagation();
      e.preventDefault();
      setMenuKey(null);
      setListMenu(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuKey(null);
        setListMenu(false);
      }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuKey, listMenu]);

  const menuItem = 'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm hover:bg-surface-hover';

  const rowMenu = (s: SavedStock, k: string) => (
    <div className="relative inline-block mr-4 sm:mr-5" data-wl-menu>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuKey(menuKey === k ? null : k);
        }}
        aria-label={`Options for ${s.name}`}
        className="tap-scale h-8 w-8 inline-flex items-center justify-center rounded-full text-muted hover:bg-surface-hover hover:text-ink"
      >
        <MoreHorizontal size={16} />
      </button>
      {menuKey === k && (
        <>
          <div className="absolute right-0 top-9 z-30 w-56 rounded-xl border border-line bg-surface shadow-lg p-1 text-left">
            <button
              className={menuItem}
              onClick={() => {
                setMenuKey(null);
                setPickKey(k);
              }}
            >
              <ListPlus size={14} /> Add to list
            </button>
            <div className="my-1 border-t border-line" />
            {activeList && (
              <button
                className={menuItem}
                onClick={() => {
                  const listId = activeList.id;
                  removeFromList(listId, k);
                  setLists(readLists());
                  setMenuKey(null);
                  toast.undo(`${s.name} removed from ${activeList.name}`, () => {
                    toggleInList(listId, k);
                    refreshLocal();
                  });
                }}
              >
                <X size={14} /> Remove from this list
              </button>
            )}
            <button className={`${menuItem} text-negative`} onClick={() => removeEverywhere(s)}>
              <Trash2 size={14} /> Remove from watchlist
            </button>
          </div>
        </>
      )}
    </div>
  );

  // Landing = the list of watchlists (with an "ALL" row on top). Stocks only show inside a list or in ALL.
  const showStocks = lists.length === 0 || active !== ALL;

  const noteStock = noteKey ? items.find((x) => skey(x) === noteKey) ?? null : null;

  return (
    <div className="space-y-4">
      <PageHeader
        className="!mb-0"
        title="Watchlist"
        actionsInline
        actions={
          <div className="flex items-center gap-4">
            {items.length > 0 && (
              <IconButton label="Export CSV" variant="secondary" onClick={exportCsv}>
                <Download size={16} />
              </IconButton>
            )}
            {lists.length < MAX_LISTS && (
              <Button size="sm" leftIcon={<Plus size={15} />} onClick={startCreate}>
                New list
              </Button>
            )}
          </div>
        }
      />
      {lists.length > 0 && (
        <div className="[&_[role=tab]]:text-[13px]">
        <Tabs
          items={[
            ...pinnedLists.map((l) => ({ key: l.id, label: l.name })),
            { key: ALL, label: 'All watchlists' },
            { key: ALLSTOCKS, label: 'ALL' },
            ...sortedLists.filter((l) => !l.pinned).map((l) => ({ key: l.id, label: l.name })),
          ]}
          value={activeList ? activeList.id : active}
          onChange={(key) => {
            setQuery('');
            setPinMode(false);
            setActive(key);
          }}
        />
        </div>
      )}
      {activeList || active === ALLSTOCKS ? null : (
        lists.length > 0 && (
          <div>
            <div className="flex items-center justify-between px-1 pb-2">
              <p className="text-sm font-semibold text-ink">
                {lists.length} {lists.length === 1 ? 'Watchlist' : 'Watchlists'}
              </p>
              <button
                type="button"
                onClick={() => setPinMode((v) => !v)}
                aria-pressed={pinMode}
                className={`tap-scale inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold ${
                  pinMode ? 'border-transparent bg-brand-500 text-white' : 'border-line text-ink hover:bg-surface-hover'
                }`}
              >
                {pinMode ? <Check size={14} /> : <Pin size={14} />}
                {pinMode ? 'Done' : 'Pin'}
              </button>
            </div>
            <Card padding="none" className="-mx-4 rounded-none sm:mx-0 sm:rounded-[20px]">
              <ul className="divide-y divide-line">
                {items.length > 0 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => {
                        if (pinMode) return;
                        setQuery('');
                        setActive(ALLSTOCKS);
                      }}
                      className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-surface-hover"
                    >
                      <span className="h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-full bg-surface-muted text-sm font-medium text-positive">
                        AL
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink">ALL</span>
                        <span className="block text-xs text-muted font-numeric">
                          {items.length} {items.length === 1 ? 'stock' : 'stocks'}
                        </span>
                      </span>
                      {!pinMode && <ChevronRight size={18} className="shrink-0 text-faint" />}
                    </button>
                  </li>
                )}
                {sortedLists.map((l) => {
                  const words = l.name.trim().split(/\s+/).filter(Boolean);
                  const initials = (words.length > 1 ? words[0][0] + words[1][0] : l.name.trim().slice(0, 2)).toUpperCase();
                  return (
                    <li key={l.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (pinMode) {
                            togglePinList(l.id);
                            setLists(readLists());
                            return;
                          }
                          setQuery('');
                          setActive(l.id);
                        }}
                        className="w-full flex items-center gap-4 px-4 py-4 text-left hover:bg-surface-hover"
                      >
                        <span className="relative h-12 w-12 shrink-0 inline-flex items-center justify-center rounded-full bg-surface-muted text-sm font-medium text-positive">
                          {initials}
                          {l.pinned && <Pin size={13} aria-label="Pinned" className="absolute -bottom-0.5 -right-0.5 fill-current text-positive" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">{l.name}</span>
                          <span className="block text-xs text-muted font-numeric">
                            {l.keys.length} {l.keys.length === 1 ? 'stock' : 'stocks'}
                          </span>
                        </span>
                        {pinMode ? (
                          <span
                            aria-label={l.pinned ? `Unpin ${l.name}` : `Pin ${l.name}`}
                            className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                              l.pinned ? 'bg-positive-soft text-positive' : 'border border-line text-faint'
                            }`}
                          >
                            <Pin size={15} className={l.pinned ? 'fill-current' : ''} />
                          </span>
                        ) : (
                          <ChevronRight size={18} className="shrink-0 text-faint" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        )
      )}
      {showStocks && items.length > 0 && (
        <div className="flex flex-nowrap items-center gap-1.5 whitespace-nowrap overflow-hidden pt-1">
              <span className="inline-flex items-center shrink-0 rounded-md bg-surface-muted px-1.5 sm:px-2 py-0.5 text-xs font-medium text-ink-2 font-numeric">
                {visible.length} {visible.length === 1 ? 'stock' : 'stocks'}
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-positive-soft px-1.5 sm:px-2 py-0.5 text-xs font-medium text-positive font-numeric">
                <span aria-hidden className="text-[0.7em] leading-none">▲</span>
                {summary.up} up
              </span>
              <span className="inline-flex items-center gap-1 shrink-0 rounded-md bg-negative-soft px-1.5 sm:px-2 py-0.5 text-xs font-medium text-negative font-numeric">
                <span aria-hidden className="text-[0.7em] leading-none">▼</span>
                {summary.down} down
              </span>
              {summary.avg !== null && (
                <span className="inline-flex items-center gap-1.5 shrink-0 rounded-md border border-line px-1.5 sm:px-2 py-0.5 text-xs font-medium text-muted font-numeric">
                  Avg
                  <DeltaChip
                    positive={summary.avg >= 0}
                    value={`${Math.abs(summary.avg).toFixed(2)}%`}
                    className="!px-1 !py-0"
                  />
                </span>
              )}
            </div>
      )}


      {showStocks && (<>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1 sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                autoCapitalize="characters"
                placeholder="Search any stock to add"
                aria-label="Search any stock to add to your watchlist"
                autoComplete="off"
                spellCheck={false}
                className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-9 text-sm text-ink outline-none focus:border-primary uppercase placeholder:normal-case"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="tap-scale absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            {activeList && (
              <div className="relative ml-auto" data-wl-menu>
                <IconButton label="List options" variant="secondary" onClick={() => setListMenu((v) => !v)}>
                  <MoreHorizontal size={16} />
                </IconButton>
                {listMenu && (
                  <div className="absolute right-0 top-10 z-30 w-44 rounded-xl border border-line bg-surface shadow-lg p-1">
                    <button
                      className={menuItem}
                      onClick={() => {
                        setListMenu(false);
                        setNameDraft(activeList.name);
                        setListModal('rename');
                      }}
                    >
                      <Pencil size={14} /> Rename
                    </button>
                    <button
                      className={menuItem}
                      onClick={() => {
                        setListMenu(false);
                        const c = duplicateList(activeList.id);
                        refreshLocal();
                        if (c) setActive(c.id);
                      }}
                    >
                      <Copy size={14} /> Duplicate
                    </button>
                    <button
                      className={`${menuItem} text-negative`}
                      onClick={() => {
                        setListMenu(false);
                        setConfirmDelete(true);
                      }}
                    >
                      <Trash2 size={14} /> Delete list
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {rawQ.length >= 3 && (
            <Card padding="none">
              <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
                {activeList ? `Add to ${activeList.name}` : 'Add to Watchlist'}
              </p>
              {hits.length === 0 ? (
                <div className="px-4 pb-4 pt-1 text-sm text-muted">
                  {hitState === 'loading' ? (
                    <div className="space-y-3 pt-1" aria-label="Searching stocks">
                      {[0, 1, 2].map((n) => (
                        <div key={n} className="flex items-center gap-3 animate-pulse">
                          <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
                          <div className="flex-1 space-y-2">
                            <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-2.5 w-1/3 rounded bg-slate-100 dark:bg-slate-800" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : hitState === 'failed' ? (
                    <>Couldn’t reach the stock search. Check your connection and try again.</>
                  ) : (
                    <>
                      No stocks found for <span className="font-medium text-ink">“{rawQ}”</span>. Try the company name or its ticker.
                    </>
                  )}
                </div>
              ) : (
                <ul className="px-2 pb-2">
                  {hits.map((h) => {
                    const added = hitInView(h);
                    const qd = hitQuotes.get(hitQuoteKey(h));
                    const diff = qd?.previousClose ? qd.price - qd.previousClose : null;
                    const pct = qd?.previousClose && diff !== null ? (diff / qd.previousClose) * 100 : null;
                    return (
                      <li key={stockKey(h.market, h.symbol)} className="flex items-center gap-2 rounded-xl px-2 py-2 hover:bg-surface-hover">
                        <button
                          type="button"
                          onClick={() =>
                            navigate(
                              `/stock?symbol=${encodeURIComponent(h.symbol)}&market=${h.market}&name=${encodeURIComponent(h.name)}&ex=${encodeURIComponent(
                                h.market === 'US' ? 'US market' : h.exchange
                              )}`
                            )
                          }
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        >
                          <CompanyLogo symbol={h.symbol} name={h.name} market={h.market} size={36} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-ink">{h.name}</span>
                            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                              <span className="truncate">{h.symbol}</span>
                              <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold bg-surface-muted border border-line text-muted">
                                {h.market === 'US' ? 'US' : h.exchange}
                              </span>
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            {qd ? (
                              <>
                                <span className="block text-sm font-semibold text-ink font-numeric">{fmtPrice(qd.price, h.market)}</span>
                                {pct !== null && (
                                  <span className={`block text-[11px] font-medium font-numeric ${pct < 0 ? 'text-negative' : 'text-positive'}`}>
                                    {pct >= 0 ? '+' : '−'}
                                    {Math.abs(pct).toFixed(2)}%
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="block h-3.5 w-14 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          // keep the keyboard open: don't let the button take focus from the search box
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            toggleHit(h);
                            searchRef.current?.focus({ preventScroll: true });
                          }}
                          aria-label={added ? `Remove ${h.name}` : `Add ${h.name}${activeList ? ` to ${activeList.name}` : ' to Watchlist'}`}
                          aria-pressed={added}
                          className={`tap-scale inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-semibold ${
                            added ? 'bg-positive-soft text-positive' : 'bg-brand-500 text-white hover:opacity-90'
                          }`}
                        >
                          {added ? <Check size={14} /> : <Plus size={14} />}
                          {added ? 'Added' : 'Add'}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}

          {rawQ.length >= 3 && visible.length === 0 ? null : activeList && activeList.keys.length === 0 ? (
            <Card>
              <EmptyState
                compact
                title={`${activeList.name} is empty`}
                description="Use the search box above to find any stock and add it to this list."
              />
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bookmark size={20} />}
                title="Your watchlist is empty"
                description="Search any stock above and tap Add, or open a stock and tap its bookmark."
              />
            </Card>
          ) : visible.length === 0 ? (
            <EmptyState compact title="No stocks match your search" />
          ) : (
            <Card padding="none" className="-mx-4 rounded-none sm:mx-0 sm:rounded-[20px]">
              <Table className="table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[88px] sm:w-[130px]" />
                  <col className="w-[84px] sm:w-[190px]" />
                  <col className="hidden lg:table-column w-[230px]" />
                  <col className="hidden md:table-column w-[190px]" />
                  <col className="w-14" />
                </colgroup>
                <THead className="sm:rounded-t-[20px]">
                  <tr>
                    <Th {...thProps('name')}>Stock</Th>
                    <Th align="right" {...thProps('price')}>
                      Price
                    </Th>
                    <Th align="right" {...thProps('change')}>
                      %
                    </Th>
                    <Th className="hidden lg:table-cell !pl-10" {...thProps('range')}>
                      52-week range
                    </Th>
                    <Th className="hidden md:table-cell !pl-6">Notes</Th>
                    <Th align="right">
                      <span className="sr-only">Actions</span>
                    </Th>
                  </tr>
                </THead>
                <TBody>
                  {visible.map((s) => {
                    const k = skey(s);
                    const qd = quotes.get(quoteKey(s));
                    const pct = pctOf(s);
                    const diff = qd?.previousClose ? qd.price - qd.previousClose : null;
                    const sh = shapes.get(k);
                    const pos = rangePos(s);
                    const alert = alerts.get(k);
                    const note = notes[k];
                    return (
                      <Tr
                        key={k}
                        data-rowkey={k}
                        onClick={() => {
                          if (!suppressClick.current) open(s);
                        }}
                        onPointerDown={(e) => startLongPress(e, k)}
                        onContextMenu={manualMovable ? (e) => e.preventDefault() : undefined}
                        className={manualMovable ? `select-none ${dragKey === k ? 'bg-surface-hover shadow-lg' : ''}` : undefined}
                      >
                        <Td>
                          <div className="flex items-center gap-3 min-w-0">
                            <CompanyLogo symbol={bare(s.symbol)} name={s.name} market={s.market} size={36} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink truncate">{s.name}</p>
                              <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted">
                                <span className="truncate min-w-0">{bare(s.symbol)}</span>
                                <span className="shrink-0 rounded px-1.5 py-px text-[10px] font-semibold bg-surface-muted border border-line text-muted">
                                  {s.market === 'US' ? 'US' : s.exchange || 'NSE'}
                                </span>
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td numeric>
                          {qd ? fmtPrice(qd.price, s.market) : <span className="inline-block h-3.5 w-16 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />}
                        </Td>
                        <Td align="right">
                          {pct !== null && diff !== null ? (
                            <div className="inline-flex items-center gap-2 justify-end">
                              <span className={`hidden sm:inline font-numeric text-sm font-medium ${diff < 0 ? 'text-negative' : 'text-positive'}`}>
                                {diff >= 0 ? '+' : '−'}
                                {fmtNum(Math.abs(diff), s.market)}
                              </span>
                              <DeltaChip positive={pct >= 0} value={`${Math.abs(pct).toFixed(2)}%`} />
                            </div>
                          ) : (
                            <span className="text-faint">–</span>
                          )}
                        </Td>
                        <Td className="hidden lg:table-cell !pl-10">
                          {sh && pos !== null && qd ? (
                            <div className="w-36">
                              <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700">
                                <span className="absolute -top-[3px] h-3 w-1 rounded-full bg-ink" style={{ left: `calc(${(pos * 100).toFixed(1)}% - 2px)` }} />
                              </div>
                              <div className="mt-1 flex justify-between text-[10px] text-muted font-numeric">
                                <span>{fmtNum(sh.low, s.market, 0)}</span>
                                <span>{fmtNum(sh.high, s.market, 0)}</span>
                              </div>
                            </div>
                          ) : (
                            <span className="inline-block h-4 w-24 rounded bg-slate-200/60 dark:bg-slate-700/60" />
                          )}
                        </Td>
                        <Td className="hidden md:table-cell !pl-6">
                          <div className="flex flex-col gap-0.5 text-xs">
                            {alert && (
                              <span className="inline-flex items-center gap-1 text-warning">
                                <Bell size={11} /> {alert.dir === 'above' ? '≥' : '≤'} {fmtNum(alert.target, s.market)}
                              </span>
                            )}
                            {note && <span className="text-muted line-clamp-2">{note}</span>}
                          </div>
                        </Td>
                        <Td align="right" className="w-12" onClick={(e) => e.stopPropagation()}>
                          {rowMenu(s, k)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
      </>)}

      <Modal
        open={listModal !== null}
        onClose={() => setListModal(null)}
        title={listModal === 'rename' ? 'Rename list' : 'New list'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setListModal(null)}>
              Cancel
            </Button>
            <Button disabled={!nameDraft.trim()} onClick={submitList}>
              {listModal === 'rename' ? 'Save' : 'Create list'}
            </Button>
          </div>
        }
      >
        <Field label="Watchlist name">
          <Input
            autoFocus
            value={nameDraft}
            maxLength={30}
            onChange={(e) => setNameDraft(e.target.value.toUpperCase())}
            autoCapitalize="characters"
            className="uppercase placeholder:normal-case"
            onKeyDown={(e) => e.key === 'Enter' && submitList()}
            placeholder="Watchlist name"
          />
        </Field>
      </Modal>

      <Modal
        open={pickKey !== null}
        onClose={() => setPickKey(null)}
        title="Add to list"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setPickKey(null)}>Done</Button>
          </div>
        }
      >
        {lists.length === 0 && <p className="text-sm text-muted">Create a list first with “New list”.</p>}
        <div className="space-y-1">
          {pickKey &&
            lists.map((l) => (
              <label key={l.id} className="flex items-center gap-3 px-2 py-2.5 rounded-lg hover:bg-surface-hover cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={l.keys.includes(pickKey)}
                  onChange={() => {
                    toggleInList(l.id, pickKey);
                    setLists(readLists());
                  }}
                  className="h-4 w-4 accent-brand-500"
                />
                <span className="truncate">{l.name}</span>
              </label>
            ))}
        </div>
      </Modal>

      <Modal
        open={noteStock !== null}
        onClose={() => setNoteKey(null)}
        title={noteStock ? `Note · ${bare(noteStock.symbol)}` : 'Note'}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setNoteKey(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (noteKey) {
                  setNote(noteKey, noteDraft);
                  setNotes(readNotes());
                }
                setNoteKey(null);
              }}
            >
              Save note
            </Button>
          </div>
        }
      >
        <Field label="Your note" hint={`${noteDraft.length}/280`}>
          <Textarea
            autoFocus
            rows={4}
            maxLength={280}
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Why are you watching this? Buy zone, thesis, reminders…"
          />
        </Field>
      </Modal>

      <ConfirmDeleteModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          if (activeList) {
            const gone = activeList;
            deleteList(gone.id);
            toast.undo(`${gone.name} list deleted`, () => {
              restoreList(gone);
              refreshLocal();
            });
          }
          setConfirmDelete(false);
          setActive(ALL);
          refreshLocal();
        }}
        title="Delete this list?"
        description={
          <>
            <strong>{activeList?.name}</strong> will be removed. The stocks stay in your watchlist.
          </>
        }
      />
    </div>
  );
}
