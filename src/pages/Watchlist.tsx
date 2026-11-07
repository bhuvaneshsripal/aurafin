import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Bell, Bookmark, Copy, Download, ListPlus, MoreHorizontal, Pencil, Plus, Search, StickyNote, Trash2, X } from 'lucide-react';
import CompanyLogo from '../components/CompanyLogo';
import { Button, Card, DeltaChip, EmptyState, Field, IconButton, Input, PageHeader, Table, TBody, Td, Textarea, Th, THead, Tr, Tabs } from '../components/ui';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { fetchLiveQuotes, type LiveQuoteDetail } from '../utils/marketPrices';
import { readSavedStocks, readStockAlerts, toggleSavedStock, type SavedStock } from '../utils/savedStocks';
import { csvCell, safeFilename, triggerDownload } from '../utils/exportCsv';
import { fetchStockHistory, fmtNum, fmtPrice, type Exchange } from '../utils/stockDetail';
import {
  MAX_LISTS,
  createList,
  deleteList,
  duplicateList,
  moveInList,
  pruneTo,
  readLists,
  readNotes,
  removeFromList,
  setNote,
  stockKey,
  toggleInList,
  updateList,
  type WatchList,
} from '../utils/watchlistLists';

const bare = (s: string) => s.replace(/\.(NS|BO)$/i, '');
// The stock page saves BSE stocks as the bare symbol + exchange "BSE", so check both (otherwise they were priced from NSE).
const isBse = (s: SavedStock) => s.market === 'IN' && (s.exchange === 'BSE' || /\.BO$/i.test(s.symbol));
const quoteKey = (s: SavedStock) => (isBse(s) ? `${bare(s.symbol).toUpperCase()}.BO` : bare(s.symbol).toUpperCase());
const skey = (s: SavedStock) => stockKey(s.market, s.symbol);
const exchangeOf = (s: SavedStock): Exchange => (isBse(s) ? 'BSE' : 'NSE');

type SortKey = 'manual' | 'name' | 'price' | 'change' | 'range';
const ALL = 'all';

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
  const [active, setActive] = useState<string>(ALL);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'manual', dir: 'asc' });
  const [menuKey, setMenuKey] = useState<string | null>(null);
  const [listMenu, setListMenu] = useState(false);
  const [noteKey, setNoteKey] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [listModal, setListModal] = useState<null | 'new' | 'rename'>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const alerts = useMemo(() => new Map(readStockAlerts().map((a) => [stockKey(a.market, a.symbol), a])), []);
  const shapes = useShapes(items);

  const refreshLocal = () => {
    setItems(readSavedStocks());
    setLists(readLists());
    setNotes(readNotes());
  };

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
    const id = window.setInterval(() => {
      stop();
      stop = load();
    }, 60_000);
    return () => {
      stop();
      window.clearInterval(id);
    };
  }, [load]);

  const activeList = lists.find((l) => l.id === active) ?? null;
  useEffect(() => {
    if (active !== ALL && !activeList) setActive(ALL);
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
    toggleSavedStock(s);
    setItems(readSavedStocks());
    setMenuKey(null);
  };

  const startCreate = () => {
    setNameDraft('');
    setListModal('new');
  };

  const submitList = () => {
    if (!nameDraft.trim()) return;
    if (listModal === 'rename' && activeList) updateList(activeList.id, { name: nameDraft });
    else {
      const l = createList(nameDraft, '');
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

  // Any click outside an open menu (or Escape) closes it; that click is swallowed so it doesn't also open a stock.
  useEffect(() => {
    if (menuKey === null && !listMenu) return;
    const onClick = (e: MouseEvent) => {
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

  const rowMenu = (s: SavedStock, k: string, note: string | undefined) => (
    <div className="relative inline-block" data-wl-menu>
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
            <p className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-faint flex items-center gap-1">
              <ListPlus size={12} /> Add to lists
            </p>
            {lists.length === 0 && <p className="px-2.5 pb-1.5 text-xs text-muted">Create a list first with “New list”.</p>}
            {lists.map((l) => (
              <label key={l.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-surface-hover cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={l.keys.includes(k)}
                  onChange={() => {
                    toggleInList(l.id, k);
                    setLists(readLists());
                  }}
                  className="accent-brand-500"
                />
                <span>{l.emoji}</span>
                <span className="truncate">{l.name}</span>
              </label>
            ))}
            <div className="my-1 border-t border-line" />
            <button
              className={menuItem}
              onClick={() => {
                setMenuKey(null);
                setNoteKey(k);
                setNoteDraft(note ?? '');
              }}
            >
              <StickyNote size={14} /> {note ? 'Edit note' : 'Add note'}
            </button>
            {manualMovable && (
              <>
                <button
                  className={menuItem}
                  onClick={() => {
                    moveInList(activeList!.id, k, -1);
                    setLists(readLists());
                  }}
                >
                  <ArrowUp size={14} /> Move up
                </button>
                <button
                  className={menuItem}
                  onClick={() => {
                    moveInList(activeList!.id, k, 1);
                    setLists(readLists());
                  }}
                >
                  <ArrowDown size={14} /> Move down
                </button>
              </>
            )}
            {activeList && (
              <button
                className={menuItem}
                onClick={() => {
                  removeFromList(activeList.id, k);
                  setLists(readLists());
                  setMenuKey(null);
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

  const noteStock = noteKey ? items.find((x) => skey(x) === noteKey) ?? null : null;
  const tabItems = [
    { key: ALL, label: 'All', count: items.length },
    ...lists.map((l) => ({ key: l.id, label: l.name, count: l.keys.length })),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Watchlist"
        meta={
          items.length > 0 ? (
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-md bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-2 font-numeric">
                {visible.length} {visible.length === 1 ? 'stock' : 'stocks'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-positive-soft px-2 py-0.5 text-xs font-medium text-positive font-numeric">
                <span aria-hidden className="text-[0.7em] leading-none">▲</span>
                {summary.up} up
              </span>
              <span className="inline-flex items-center gap-1 rounded-md bg-negative-soft px-2 py-0.5 text-xs font-medium text-negative font-numeric">
                <span aria-hidden className="text-[0.7em] leading-none">▼</span>
                {summary.down} down
              </span>
              {summary.avg !== null && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-0.5 text-xs font-medium text-muted font-numeric">
                  Avg
                  <DeltaChip
                    positive={summary.avg >= 0}
                    value={`${Math.abs(summary.avg).toFixed(2)}%`}
                    className="!px-1 !py-0"
                  />
                </span>
              )}
            </span>
          ) : undefined
        }
        actionsInline
        actions={
          <>
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
          </>
        }
      />

      {lists.length > 0 && <Tabs value={active} onChange={(k) => setActive(k)} items={tabItems} />}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Bookmark size={20} />}
            title="Your watchlist is empty"
            description="Open any stock and tap the bookmark to add it here."
          />
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[160px] flex-1 sm:max-w-sm">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search stocks"
                className="h-10 w-full rounded-lg border border-line bg-surface pl-9 pr-3 text-sm text-ink outline-none focus:border-primary"
              />
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

          {activeList && activeList.keys.length === 0 ? (
            <Card>
              <EmptyState
                compact
                title={`${activeList.name} is empty`}
                description="In the All tab, open a stock's ⋯ menu and choose “Add to lists”."
              />
            </Card>
          ) : visible.length === 0 ? (
            <EmptyState compact title="No stocks match your search" />
          ) : (
            <Card padding="none">
              <Table className="table-fixed">
                <colgroup>
                  <col />
                  <col className="w-[104px] sm:w-[130px]" />
                  <col className="w-[128px] sm:w-[190px]" />
                  <col className="hidden lg:table-column w-[230px]" />
                  <col className="hidden md:table-column w-[190px]" />
                  <col className="w-14" />
                </colgroup>
                <THead className="rounded-t-[20px]">
                  <tr>
                    <Th {...thProps('name')}>Stock</Th>
                    <Th align="right" {...thProps('price')}>
                      Price
                    </Th>
                    <Th align="right" {...thProps('change')}>
                      Day
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
                      <Tr key={k} onClick={() => open(s)}>
                        <Td>
                          <div className="flex items-center gap-3 min-w-0">
                            <CompanyLogo symbol={bare(s.symbol)} name={s.name} market={s.market} size={36} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-ink truncate">{s.name}</p>
                              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                                <span>{bare(s.symbol)}</span>
                                <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-surface-muted border border-line text-muted">
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
                              <span className={`font-numeric text-sm font-medium ${diff < 0 ? 'text-negative' : 'text-positive'}`}>
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
                          {rowMenu(s, k, note)}
                        </Td>
                      </Tr>
                    );
                  })}
                </TBody>
              </Table>
            </Card>
          )}
        </>
      )}

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
        <Field label="List name" hint="For example: Dividend picks, Long term, Watch for dips">
          <Input
            autoFocus
            value={nameDraft}
            maxLength={30}
            onChange={(e) => setNameDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitList()}
            placeholder="List name"
          />
        </Field>
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
          if (activeList) deleteList(activeList.id);
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
