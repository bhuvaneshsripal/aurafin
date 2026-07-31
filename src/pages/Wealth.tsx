import { useState, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Plus,
  Trash2,
  Pencil,
  Copy,
  Download,
  TrendingUp,
  TrendingDown,
  ArrowLeft,
  Search,
  LayoutGrid,
  List as ListIcon,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  GripVertical,
  X,
  Loader2,
  CheckCircle2,
  Link2Off,
  Tag,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import { exportToCsv } from '../utils/exportCsv';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import type { Asset, AssetClass, Liability, LiabilityClass } from '../types';
import { CURRENCIES, formatPreciseCurrency, maskPreciseAmount, isZeroAmount } from '../utils/currency';
import {
  ASSET_TAXONOMY,
  LIABILITY_TAXONOMY,
  ASSET_CLASS_LABELS,
  ASSET_CLASS_COLORS,
  ASSET_CLASS_TO_CATEGORY,
  LIABILITY_CLASS_LABELS,
  LIABILITY_CLASS_TO_CATEGORY,
  SYMBOL_ENABLED_CLASSES,
  DEPOSIT_LIKE_CLASSES,
  RECURRING_DEPOSIT_CLASSES,
  SIP_CLASSES,
  WEIGHT_TRACKED_CLASSES,
  type CategoryDef,
} from '../utils/taxonomy';
import {
  resolveAssetValues,
  computeMaturityInfo,
  computeSipProgress,
  listSipInstallments,
} from '../utils/assetValues';
import {
  searchMutualFunds,
  fetchFundNavHistory,
  computeSipLiveValue,
  type MfSearchResult,
} from '../utils/mutualFunds';

type Tab = 'assets' | 'liabilities' | 'networth' | 'allocation';
type SortKey = 'manual' | 'name' | 'qty' | 'avgCost' | 'perUnit' | 'invested' | 'value' | 'pnl' | 'alloc';
type EntryType = 'asset' | 'liability';

/**
 * Renders a weight-tracked quantity (grams) safely. Rounds to 4 decimal
 * places (0.1 mg precision) so older records saved before that rounding was
 * applied at write-time — e.g. "0.454099999999999995" from floating-point
 * addition — never render their raw float, and trims trailing zeros so
 * "5.0000" shows as "5".
 */
function formatGrams(qty: number): string {
  return (Math.round(qty * 10000) / 10000).toString();
}

export default function Wealth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('assets');
  const [addFlow, setAddFlow] = useState<EntryType | null>(null);
  const [startCategoryKey, setStartCategoryKey] = useState<string | undefined>();

  // Onboarding's "Add your assets" step hands off a chosen asset category
  // via navigation state so this page can jump straight into Step 2 of the
  // add flow instead of making the person pick the category again.
  useEffect(() => {
    const startAddAsset = (location.state as { startAddAsset?: string } | null)?.startAddAsset;
    if (startAddAsset) {
      setStartCategoryKey(startAddAsset);
      setAddFlow('asset');
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (addFlow) {
    return (
      <AddWealthPage
        initialEntryType={addFlow}
        initialCategoryKey={startCategoryKey}
        onClose={() => {
          setAddFlow(null);
          setStartCategoryKey(undefined);
        }}
      />
    );
  }

  return (
    <div className="space-y-4">
      {tab === 'assets' && (
        <AssetsTab tab={tab} setTab={setTab} onAdd={() => setAddFlow('asset')} />
      )}
      {tab === 'liabilities' && (
        <LiabilitiesTab tab={tab} setTab={setTab} onAdd={() => setAddFlow('liability')} />
      )}
      {tab === 'networth' && <NetWorthTab tab={tab} setTab={setTab} />}
      {tab === 'allocation' && <AllocationTab tab={tab} setTab={setTab} />}
    </div>
  );
}

/** Full-page "Add Asset / Add Liability" flow: Step 1 picks a type, Step 2 fills in details. */
function AddWealthPage({
  initialEntryType,
  initialCategoryKey,
  onClose,
}: {
  initialEntryType: EntryType;
  initialCategoryKey?: string;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const [entryType, setEntryType] = useState<EntryType>(initialEntryType);
  const [step, setStep] = useState<'category' | 'details'>(initialCategoryKey ? 'details' : 'category');
  const [categoryKey, setCategoryKey] = useState<string | undefined>(initialCategoryKey);
  const [pickedType, setPickedType] = useState<string | undefined>(() => {
    if (!initialCategoryKey) return undefined;
    const taxonomy = initialEntryType === 'asset' ? ASSET_TAXONOMY : LIABILITY_TAXONOMY;
    return taxonomy.find((c) => c.key === initialCategoryKey)?.types[0]?.value;
  });

  const taxonomy = entryType === 'asset' ? ASSET_TAXONOMY : LIABILITY_TAXONOMY;
  const category = taxonomy.find((c) => c.key === categoryKey);

  const resetToCategory = () => {
    setStep('category');
    setCategoryKey(undefined);
    setPickedType(undefined);
  };

  const switchEntryType = (next: EntryType) => {
    if (next === entryType) return;
    setEntryType(next);
    setStep('category');
    setCategoryKey(undefined);
    setPickedType(undefined);
  };

  const selectCategory = (cat: CategoryDef<string>) => {
    setCategoryKey(cat.key);
    setPickedType(cat.types[0]?.value);
    setStep('details');
  };

  const handleSaveAsset = async (asset: Asset) => {
    if (!user) return;
    try {
      await upsertDoc(user.uid, 'assets', asset.profileId ? asset : { ...asset, profileId: activeProfileId ?? undefined });
      onClose();
    } catch (err) {
      console.error('Failed to save asset', err);
      alert('Could not save this asset. Please check your connection and try again.');
    }
  };

  const handleSaveLiability = async (liability: Liability) => {
    if (!user) return;
    try {
      await upsertDoc(
        user.uid,
        'liabilities',
        liability.profileId ? liability : { ...liability, profileId: activeProfileId ?? undefined }
      );
      onClose();
    } catch (err) {
      console.error('Failed to save liability', err);
      alert('Could not save this liability. Please check your connection and try again.');
    }
  };

  const noun = entryType === 'asset' ? 'Asset' : 'Liability';
  const nounPlural = entryType === 'asset' ? 'Assets' : 'Liabilities';

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Add {noun}</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            Step {step === 'category' ? 1 : 2} of 2:{' '}
            {step === 'category' ? `Select ${entryType} type` : 'Enter details'}
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 shrink-0"
        >
          <ArrowLeft size={16} /> Back to {nounPlural}
        </button>
      </div>

      <div className="flex bg-slate-100 rounded-xl p-1 gap-1 max-w-sm">
        <button
          onClick={() => switchEntryType('asset')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            entryType === 'asset' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingUp size={15} /> Asset
        </button>
        <button
          onClick={() => switchEntryType('liability')}
          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium transition-colors ${
            entryType === 'liability' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <TrendingDown size={15} /> Liability
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        {step === 'category' ? (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Select {noun} Type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {taxonomy.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => selectCategory(cat)}
                    className="flex flex-col items-center justify-center gap-2 border border-slate-200 rounded-xl p-4 hover:border-brand-400 hover:bg-brand-50 transition-colors text-center"
                  >
                    <Icon size={22} className="text-slate-600" />
                    <span className="font-medium text-slate-800 text-sm">{cat.label}</span>
                    {cat.types.length > 1 && (
                      <span className="text-xs text-slate-400">{cat.types.length} types</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : entryType === 'asset' ? (
          <AssetDetailsForm
            category={category as CategoryDef<AssetClass> | undefined}
            initial={null}
            initialType={pickedType as AssetClass}
            onBack={resetToCategory}
            onSave={handleSaveAsset}
          />
        ) : (
          <LiabilityDetailsForm
            category={category as CategoryDef<LiabilityClass> | undefined}
            initial={null}
            initialType={pickedType as LiabilityClass}
            onBack={resetToCategory}
            onSave={handleSaveLiability}
          />
        )}
      </div>
    </div>
  );
}

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

function TabNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto no-scrollbar -mx-4 px-4 sm:mx-0 sm:px-0">
      {(
        [
          ['assets', 'Assets'],
          ['liabilities', 'Liabilities'],
          ['networth', 'Net Worth'],
          ['allocation', 'Allocation'],
        ] as [Tab, string][]
      ).map(([key, label]) => (
        <button
          key={key}
          onClick={() => setTab(key)}
          className={`shrink-0 whitespace-nowrap px-3.5 sm:px-4 py-2.5 text-sm sm:text-base font-medium border-b-2 -mb-px transition-colors ${
            tab === key
              ? 'border-brand-600 text-brand-700 dark:text-brand-300'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function FilterDropdown({
  label,
  placeholder,
  options,
  selected,
  onChange,
}: {
  label: string;
  placeholder: string;
  options: { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));

  const toggleOption = (value: string) => {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value));
    else onChange([...selected, value]);
  };

  return (
    <div className="relative w-full min-w-0 sm:flex-1 sm:min-w-[180px]" ref={ref}>
      <span className="text-xs font-medium text-slate-500 mb-0.5 sm:mb-1 block">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[38px] sm:min-h-[42px] flex items-center justify-between gap-1.5 border border-slate-200 rounded-lg px-2.5 sm:px-3 py-1 sm:py-1.5 bg-white text-left"
      >
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-slate-400 text-xs sm:text-sm truncate">{placeholder}</span>
          ) : (
            selected.map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-[11px] sm:text-xs font-medium pl-2 pr-1 py-0.5 sm:py-1 rounded-md max-w-full truncate"
                >
                  {opt?.label ?? v}
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(v);
                    }}
                    className="hover:bg-slate-200 rounded-sm p-0.5 shrink-0"
                  >
                    <X size={12} />
                  </span>
                </span>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-1 text-slate-400 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="hover:text-slate-600"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-400">No options yet</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleOption(opt.value)}
                  className="h-4 w-4 rounded border-slate-300"
                />
                {opt.label}
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TotalStatCard({
  title,
  invested,
  currentValue,
  pnl,
  pnlPercent,
  currency = 'INR',
  privacyMode,
}: {
  title: string;
  invested: number;
  currentValue: number;
  pnl: number;
  pnlPercent: number;
  currency?: string;
  privacyMode: boolean;
}) {
  const positive = pnl >= 0;
  const isMasked = privacyMode && !isZeroAmount(pnl, 2);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
      <p className="text-xs font-semibold tracking-wide text-slate-400 mb-4 sm:mb-5">{title}</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 sm:gap-6">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">INVESTED</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
            {maskPreciseAmount(invested, currency, privacyMode)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">CURRENT VALUE</p>
          <p className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white break-words">
            {maskPreciseAmount(currentValue, currency, privacyMode)}
          </p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs font-medium text-slate-400 mb-1">P&L</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xl sm:text-2xl font-bold break-words ${positive ? 'text-brand-600 dark:text-brand-300' : 'text-red-500'}`}>
              {isMasked ? '••••••' : `${positive ? '+' : ''}${formatPreciseCurrency(pnl, currency)}`}
            </span>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                positive ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300' : 'bg-red-50 dark:bg-red-900/30 text-red-500'
              }`}
            >
              {positive ? '+' : ''}
              {pnlPercent.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'red' | 'slate';
}) {
  const toneClass =
    tone === 'brand' ? 'text-brand-700' : tone === 'red' ? 'text-red-500' : 'text-slate-900';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
      <p className={`text-2xl font-bold ${toneClass}`}>{value}</p>
    </div>
  );
}

function AssetsTab({
  tab,
  setTab,
  onAdd,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onAdd: () => void;
}) {
  const allAssets = useAssetsStore((s) => s.assets);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const user = useAuthStore((s) => s.user);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const setHideFab = useUiStore((s) => s.setHideFab);

  // After a manual up/down reorder, the moved row's new position can end up
  // off-screen (e.g. moving something to the very top of a long list while
  // scrolled halfway down). rowRefs keeps a live DOM-node lookup by asset id;
  // once the Firestore write round-trips and `allAssets` updates with the
  // new order, the effect below scrolls that row into view automatically.
  const rowRefs = useRef<Map<string, HTMLElement>>(new Map());
  const [scrollToId, setScrollToId] = useState<string | null>(null);
  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };
  useEffect(() => {
    if (!scrollToId) return;
    const el = rowRefs.current.get(scrollToId);
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setScrollToId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssets]);

  // Long-press-to-drag reordering is a desktop-only affordance — on a
  // touchscreen, a long press already means something else (context menu /
  // text selection) and a real drag gesture there is finicky at best, so
  // this checks for a precise pointer (mouse/trackpad) rather than screen
  // size, which also correctly excludes touch-first "desktop mode" tablets.
  const [isDesktopPointer, setIsDesktopPointer] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(pointer: fine)');
    setIsDesktopPointer(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktopPointer(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // armedId: draggable={true} kicks in only after a short hold, so a quick
  // click still behaves like a normal click. draggingId/overId drive the
  // visual feedback while an actual drag is in flight.
  const [armedId, setArmedId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const longPressTimer = useRef<number | null>(null);

  const clearLongPress = () => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const armDrag = (id: string, e: ReactPointerEvent) => {
    if (!isDesktopPointer) return;
    // Starting the press on a button/checkbox/link should never arm a
    // drag — those need their normal click behavior untouched.
    if ((e.target as HTMLElement).closest('button, input, a, select')) return;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => setArmedId(id), 180);
  };

  const resetDragState = () => {
    clearLongPress();
    setArmedId(null);
    setDraggingId(null);
    setOverId(null);
  };

  // The bulk-selection bar and the global "+" FAB sit in the same bottom-right
  // corner on mobile — hide the FAB while the bar is up so they don't overlap.
  useEffect(() => {
    setHideFab(selectedIds.size > 0);
    return () => setHideFab(false);
  }, [selectedIds.size, setHideFab]);

  const toggleRowSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<Asset | null>(null);
  const [confirmBulkDeleteOpen, setConfirmBulkDeleteOpen] = useState(false);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'assets', id);
  };

  const handleDuplicate = async (a: Asset) => {
    if (!user) return;
    await upsertDoc(user.uid, 'assets', {
      ...a,
      id: crypto.randomUUID(),
      name: `${a.name} (Copy)`,
      updatedAt: Date.now(),
    });
  };

  /** Manual reorder for the grid view — swaps this asset's position with
   *  its neighbor above/below. Falls back to each asset's current index
   *  as its order the first time it's moved. */
  const handleMove = async (id: string, direction: 'up' | 'down') => {
    if (!user) return;
    setSortKey('manual');
    setScrollToId(id);
    const ordered = [...assets].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt
    );
    const idx = ordered.findIndex((a) => a.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const current = ordered[idx];
    const neighbor = ordered[swapIdx];
    const currentOrder = current.order ?? idx;
    const neighborOrder = neighbor.order ?? swapIdx;
    try {
      await upsertDoc(user.uid, 'assets', { ...current, order: neighborOrder });
      await upsertDoc(user.uid, 'assets', { ...neighbor, order: currentOrder });
    } catch (err) {
      console.error('Failed to reorder assets', err);
    }
  };

  /** Drag-and-drop reorder — drops `draggedId` into `targetId`'s slot and
   *  shifts everything else, then persists the new order for every asset
   *  whose position actually changed. */
  const handleReorderTo = async (draggedId: string, targetId: string) => {
    if (!user || draggedId === targetId) return;
    const ordered = [...assets].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt
    );
    const fromIdx = ordered.findIndex((x) => x.id === draggedId);
    const toIdx = ordered.findIndex((x) => x.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...ordered];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setSortKey('manual');
    try {
      await Promise.all(
        reordered
          .map((asset, idx) => ({ asset, idx }))
          .filter(({ asset, idx }) => (asset.order ?? -1) !== idx)
          .map(({ asset, idx }) => upsertDoc(user.uid, 'assets', { ...asset, order: idx }))
      );
    } catch (err) {
      console.error('Failed to reorder assets', err);
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleSave = async (asset: Asset) => {
    if (!user) return;
    try {
      await upsertDoc(user.uid, 'assets', asset);
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save asset', err);
      alert('Could not save this asset. Please check your connection and try again.');
    }
  };

  const handleExport = () => {
    exportToCsv(
      'assets',
      assets.map((a) => {
        const { invested, currentPrice, value, pnl, pnlPercent } = resolveAssetValues(a, livePrices, sipValues);
        return {
          Name: a.name,
          Symbol: a.symbol ?? '',
          Quantity: a.quantity ?? '',
          'Avg. Cost': a.avgCost ?? '',
          'Asset Class': ASSET_CLASS_LABELS[a.assetClass],
          Invested: invested ?? '',
          'Current Price': currentPrice ?? '',
          'Current Value': value,
          'P&L': pnl ?? '',
          'P&L %': pnlPercent !== undefined ? pnlPercent.toFixed(2) : '',
          Currency: a.currency,
        };
      })
    );
  };

  const filtered = assets
    .filter((a) => {
      const q = search.trim().toLowerCase();
      const matchesSearch =
        !q || a.name.toLowerCase().includes(q) || (a.symbol ?? '').toLowerCase().includes(q);
      const category = ASSET_CLASS_TO_CATEGORY[a.assetClass];
      const matchesCategory =
        selectedCategories.length === 0 || (category && selectedCategories.includes(category.key));
      const matchesType = selectedTypes.length === 0 || selectedTypes.includes(a.assetClass);
      const matchesCurrency = selectedCurrencies.length === 0 || selectedCurrencies.includes(a.currency);
      return matchesSearch && matchesCategory && matchesType && matchesCurrency;
    })
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt);

  const allFilteredSelected = filtered.length > 0 && filtered.every((a) => selectedIds.has(a.id));
  const toggleSelectAll = () => {
    setSelectedIds(allFilteredSelected ? new Set() : new Set(filtered.map((a) => a.id)));
  };

  const totalValue = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues).value, 0);

  const rows = filtered.map((a) => {
    const computed = resolveAssetValues(a, livePrices, sipValues);
    const alloc = totalValue > 0 ? (computed.value / totalValue) * 100 : 0;
    return { asset: a, ...computed, alloc };
  });

  const totalInvested = rows.reduce((s, r) => s + (r.invested ?? r.value), 0);
  const totalCurrentValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPnl = totalCurrentValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  const categoryOptions = ASSET_TAXONOMY.filter((cat) =>
    assets.some((a) => (ASSET_CLASS_TO_CATEGORY[a.assetClass] ?? cat).key === cat.key)
  ).map((cat) => ({ value: cat.key, label: cat.label }));

  const typeOptions = Array.from(
    new Set(
      assets
        .filter((a) => {
          const category = ASSET_CLASS_TO_CATEGORY[a.assetClass];
          return (
            selectedCategories.length === 0 || (category && selectedCategories.includes(category.key))
          );
        })
        .map((a) => a.assetClass)
    )
  ).map((cls) => ({ value: cls, label: ASSET_CLASS_LABELS[cls] ?? cls }));

  const currencyOptions = Array.from(new Set(assets.map((a) => a.currency))).map((c) => ({
    value: c,
    label: c,
  }));

  useEffect(() => {
    const valid = new Set<string>(typeOptions.map((o) => o.value));
    setSelectedTypes((prev) => prev.filter((t) => valid.has(t)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories.join(',')]);

  const sortedRows =
    sortKey === 'manual'
      ? rows
      : [...rows].sort((a, b) => {
          const dir = sortDir === 'asc' ? 1 : -1;
          const getVal = (r: (typeof rows)[number]): string | number => {
            switch (sortKey) {
              case 'name':
                return r.asset.name.toLowerCase();
              case 'qty':
                return r.asset.quantity ?? 0;
              case 'avgCost':
                return r.asset.avgCost ?? 0;
              case 'perUnit':
                return r.currentPrice ?? 0;
              case 'invested':
                return r.invested ?? 0;
              case 'value':
                return r.value;
              case 'pnl':
                return r.pnl ?? 0;
              case 'alloc':
                return r.alloc;
              default:
                return 0;
            }
          };
          const av = getVal(a);
          const bv = getVal(b);
          if (typeof av === 'string' || typeof bv === 'string') {
            return String(av).localeCompare(String(bv)) * dir;
          }
          return (av - bv) * dir;
        });

  const openEdit = (a: Asset) => {
    setEditing(a);
    setModalOpen(true);
  };

  if (viewingAsset) {
    const live = assets.find((x) => x.id === viewingAsset.id) ?? viewingAsset;
    return (
      <AssetDetailPage
        asset={live}
        onBack={() => setViewingAsset(null)}
        onEdit={(a) => {
          setViewingAsset(null);
          openEdit(a);
        }}
        onDelete={async (id) => {
          await handleDelete(id);
          setViewingAsset(null);
        }}
      />
    );
  }

  function SortHeader({
    label,
    sortKeyName,
    align = 'left',
  }: {
    label: string;
    sortKeyName: SortKey;
    align?: 'left' | 'right';
  }) {
    const active = sortKey === sortKeyName;
    return (
      <th
        onClick={() => toggleSort(sortKeyName)}
        className={`px-4 py-3 font-medium cursor-pointer select-none hover:text-slate-700 whitespace-nowrap ${
          align === 'right' ? 'text-right' : 'text-left'
        }`}
      >
        <span
          className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}
        >
          {label}
          {active ? (
            sortDir === 'desc' ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronUp size={14} />
            )
          ) : (
            <ArrowUpDown size={12} className="text-slate-300" />
          )}
        </span>
      </th>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">Assets</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">{assets.length} assets</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mt-1">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live prices update every 60 seconds
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[140px] sm:flex-none">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-3 py-2 border-2 border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-white rounded-lg text-sm w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden shrink-0">
            <button
              onClick={() => setViewMode('grid')}
              className={`h-9 w-9 flex items-center justify-center ${
                viewMode === 'grid' ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`h-9 w-9 flex items-center justify-center border-l border-slate-200 dark:border-slate-700 ${
                viewMode === 'list' ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-white' : 'text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <ListIcon size={16} />
            </button>
          </div>
          <button
            onClick={handleExport}
            disabled={assets.length === 0}
            title="Export CSV"
            className="h-9 w-9 flex items-center justify-center border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-slate-500 dark:text-slate-400 rounded-lg shrink-0"
          >
            <Download size={16} />
          </button>
          <button
            onClick={onAdd}
            className="w-full sm:w-auto justify-center flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
          >
            <Plus size={18} /> Add Asset
          </button>
        </div>
      </div>

      <TabNav tab={tab} setTab={setTab} />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="grid grid-cols-2 gap-2.5 sm:contents">
          <FilterDropdown
            label="Filter"
            placeholder="Category"
            options={categoryOptions}
            selected={selectedCategories}
            onChange={setSelectedCategories}
          />
          <FilterDropdown
            label="Type"
            placeholder="Type"
            options={typeOptions}
            selected={selectedTypes}
            onChange={setSelectedTypes}
          />
          <FilterDropdown label="Tags" placeholder="Tag" options={[]} selected={[]} onChange={() => {}} />
          <FilterDropdown
            label="Currency"
            placeholder="Currency"
            options={currencyOptions}
            selected={selectedCurrencies}
            onChange={setSelectedCurrencies}
          />
        </div>
        <div className="flex items-center gap-2 sm:contents">
          {sortKey !== 'manual' && viewMode === 'list' && (
            <button
              onClick={() => setSortKey('manual')}
              className="h-[38px] sm:h-[42px] shrink-0 px-3 flex items-center justify-center border border-slate-200 rounded-lg text-sm text-slate-500 hover:bg-slate-50 whitespace-nowrap"
            >
              Manual order
            </button>
          )}
          <button
            onClick={() => toggleSort(sortKey)}
            title="Flip sort direction"
            className="h-[38px] w-[38px] sm:h-[42px] sm:w-[42px] shrink-0 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <ArrowUpDown size={16} />
          </button>
        </div>
      </div>

      <TotalStatCard
        title="TOTAL ASSETS"
        invested={totalInvested}
        currentValue={totalCurrentValue}
        pnl={totalPnl}
        pnlPercent={totalPnlPercent}
        privacyMode={privacyMode}
      />

      {filtered.length === 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 px-4 py-14 flex flex-col items-center justify-center text-center gap-4">
          <p className="text-slate-400">
            {assets.length === 0 ? 'No assets yet. Add your first one to get started.' : 'No assets match your search.'}
          </p>
          {assets.length === 0 && (
            <button
              onClick={onAdd}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
            >
              <Plus size={18} /> Add Asset
            </button>
          )}
        </div>
      )}

      {filtered.length > 0 && viewMode === 'list' ? (
        <>
          <div className="md:hidden flex items-center justify-between px-1">
            <button
              onClick={toggleSelectAll}
              className="text-xs font-medium text-brand-600 hover:text-brand-700 py-1"
            >
              {allFilteredSelected ? 'Deselect all' : `Select all ${filtered.length}`}
            </button>
          </div>

          {/* Mobile: simplified rows — name, current value, P&L only. Tap a row to view details;
              tap the checkbox (or tap a row while others are selected) to multi-select. */}
          <div className="md:hidden bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
            {sortedRows.map(({ asset: a, value, pnl, pnlPercent }) => (
              <div
                key={a.id}
                className={`w-full flex items-center gap-3 px-4 py-3.5 active:bg-slate-50 ${
                  selectedIds.has(a.id) ? 'bg-brand-50/60' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(a.id)}
                  onChange={() => toggleRowSelect(a.id)}
                  className="h-4 w-4 rounded border-slate-300 shrink-0"
                />
                <button
                  onClick={() => (selectedIds.size > 0 ? toggleRowSelect(a.id) : setViewingAsset(a))}
                  className="flex-1 flex items-center justify-between gap-3 text-left min-w-0"
                >
                  <p className="font-semibold text-slate-800 truncate">{a.name}</p>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-slate-800">
                      {maskPreciseAmount(value, a.currency, privacyMode)}
                    </p>
                    {pnl !== undefined && (
                      <p className={`text-xs ${pnl >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                        {privacyMode && !isZeroAmount(pnl, 2)
                          ? '••••••'
                          : `${pnl >= 0 ? '+' : ''}${formatPreciseCurrency(pnl, a.currency)}`}
                        {pnlPercent !== undefined && ` (${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`}
                      </p>
                    )}
                  </div>
                </button>
              </div>
            ))}
          </div>

          {/* Bottom action bar — appears once one or more rows are checked.
              Sits above BottomNav on mobile, floats bottom-right on desktop
              (where there's no BottomNav to clash with). */}
          {selectedIds.size > 0 && (
            <div className="fixed z-30 bottom-20 left-4 right-4 md:bottom-6 md:left-auto md:right-6 md:w-auto">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-lg flex items-center justify-between gap-4 px-4 py-3">
                <span className="text-sm font-medium text-slate-700 whitespace-nowrap">
                  {selectedIds.size} selected
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setTagModalOpen(true)}
                    title="Tag"
                    className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <Tag size={16} />
                  </button>
                  <button
                    onClick={() => {
                      if (selectedIds.size !== 1) {
                        alert('Select exactly one asset to change it.');
                        return;
                      }
                      const id = Array.from(selectedIds)[0];
                      const a = assets.find((x) => x.id === id);
                      if (a) {
                        setSelectedIds(new Set());
                        openEdit(a);
                      }
                    }}
                    title="Change asset"
                    className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500"
                  >
                    <LayoutGrid size={16} />
                  </button>
                  <button
                    onClick={() => setConfirmBulkDeleteOpen(true)}
                    title="Delete"
                    className="h-9 w-9 flex items-center justify-center rounded-lg hover:bg-green-50 text-green-600"
                  >
                    <Trash2 size={16} />
                  </button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    title="Clear selection"
                    className="h-9 w-9 flex items-center justify-center rounded-full bg-brand-600 hover:bg-brand-700 text-white ml-1"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <Modal open={tagModalOpen} onClose={() => setTagModalOpen(false)} title="Add Tag">
            <div className="space-y-3">
              <Field label="Tag name">
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  placeholder="e.g. Long-term"
                  className={inputClass}
                />
              </Field>
              <p className="text-xs text-slate-400">
                Tags aren't part of the asset data model yet — this confirms the action but doesn't
                persist anything until a `tags` field is added to the schema.
              </p>
              <button
                onClick={() => {
                  alert(`Tagged ${selectedIds.size} asset(s) as "${tagDraft || 'Untitled'}".`);
                  setTagDraft('');
                  setTagModalOpen(false);
                  setSelectedIds(new Set());
                }}
                className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium"
              >
                Save Tag
              </button>
            </div>
          </Modal>

          {/* Desktop/laptop: full table, every column. */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                </th>
                <SortHeader label="NAME" sortKeyName="name" />
                <SortHeader label="QTY" sortKeyName="qty" align="right" />
                <SortHeader label="AVG. COST" sortKeyName="avgCost" align="right" />
                <SortHeader label="PER UNIT" sortKeyName="perUnit" align="right" />
                <SortHeader label="INVESTED" sortKeyName="invested" align="right" />
                <SortHeader label="CUR. VAL" sortKeyName="value" align="right" />
                <SortHeader label="P&L" sortKeyName="pnl" align="right" />
                <SortHeader label="% ALLOC" sortKeyName="alloc" align="right" />
                <th className="px-4 py-3 w-44"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map(({ asset: a, invested, currentPrice, value, pnl, pnlPercent, alloc }) => (
                <tr
                  key={a.id}
                  ref={setRowRef(a.id)}
                  draggable={armedId === a.id}
                  onPointerDown={(e) => armDrag(a.id, e)}
                  onPointerUp={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onDragStart={(e) => {
                    setDraggingId(a.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    setOverId(a.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingId) handleReorderTo(draggingId, a.id);
                    resetDragState();
                  }}
                  onDragEnd={resetDragState}
                  className={`group hover:bg-slate-50/60 transition-colors ${
                    isDesktopPointer ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${draggingId === a.id ? 'opacity-40' : ''} ${
                    overId === a.id && draggingId && draggingId !== a.id
                      ? 'bg-brand-50/70 outline outline-2 outline-brand-300 -outline-offset-2'
                      : ''
                  }`}
                >
                  <td className="px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(a.id)}
                      onChange={() => toggleRowSelect(a.id)}
                      className="h-4 w-4 rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-start gap-2">
                      {isDesktopPointer && (
                        <GripVertical
                          size={14}
                          className="mt-1 text-slate-300 group-hover:text-slate-400 shrink-0"
                        />
                      )}
                      <div>
                        <p className="font-semibold text-slate-800">{a.name}</p>
                        <p className="text-xs text-slate-400">
                          {ASSET_CLASS_LABELS[a.assetClass]}
                          {a.institution ? ` · ${a.institution}` : ''}
                          {a.interestRate ? ` · ${a.interestRate}% p.a.` : ''}
                          {a.maturityDate && !computeMaturityInfo(a).isMatured
                            ? ` · Matures ${a.maturityDate}`
                            : ''}
                        </p>
                        {(() => {
                          const { maturityAmount, isMatured } = computeMaturityInfo(a);
                          return maturityAmount !== undefined && !isMatured ? (
                            <p className="text-xs text-brand-600 font-medium">
                              Maturity amount: {formatPreciseCurrency(maturityAmount, a.currency)}
                            </p>
                          ) : null;
                        })()}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {a.quantity !== undefined
                      ? WEIGHT_TRACKED_CLASSES.has(a.assetClass)
                        ? `${formatGrams(a.quantity)} g`
                        : a.quantity
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {a.avgCost !== undefined ? formatPreciseCurrency(a.avgCost, a.currency) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {currentPrice !== undefined ? formatPreciseCurrency(currentPrice, a.currency) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">
                    {invested !== undefined ? formatPreciseCurrency(invested, a.currency) : '—'}
                  </td>
                  <td className="px-4 py-3.5 text-right font-semibold text-slate-800">
                    {maskPreciseAmount(value, a.currency, privacyMode)}
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {pnl !== undefined ? (
                      <>
                        <p className={`font-semibold ${pnl >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                          {pnl >= 0 ? '+' : ''}
                          {formatPreciseCurrency(pnl, a.currency)}
                        </p>
                        {pnlPercent !== undefined && (
                          <p className={`text-xs ${pnl >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                            {pnl >= 0 ? '+' : ''}
                            {pnlPercent.toFixed(1)}%
                          </p>
                        )}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">{alloc.toFixed(1)}%</td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleMove(a.id, 'up')}
                        disabled={filtered.findIndex((x) => x.id === a.id) === 0}
                        title="Move up"
                        className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-transparent rounded-md p-1 transition-colors"
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMove(a.id, 'down')}
                        disabled={filtered.findIndex((x) => x.id === a.id) === filtered.length - 1}
                        title="Move down"
                        className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-transparent rounded-md p-1 transition-colors"
                      >
                        <ChevronDown size={16} />
                      </button>
                      <button
                        onClick={() => handleDuplicate(a)}
                        title="Duplicate"
                        className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 rounded-md p-1 transition-colors"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        title="Edit"
                        className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 rounded-md p-1 transition-colors"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => setConfirmDeleteAsset(a)}
                        title="Delete"
                        className="text-slate-600 border border-slate-300 hover:text-red-600 hover:border-red-400 hover:bg-red-50 rounded-md p-1 transition-colors"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </>
      ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a, idx) => {
              const { value, pnl, pnlPercent } = resolveAssetValues(a, livePrices, sipValues);
              const { maturityAmount, isMatured } = computeMaturityInfo(a);
              return (
                <div
                  key={a.id}
                  ref={setRowRef(a.id)}
                  draggable={armedId === a.id}
                  onPointerDown={(e) => armDrag(a.id, e)}
                  onPointerUp={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onDragStart={(e) => {
                    setDraggingId(a.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    setOverId(a.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggingId) handleReorderTo(draggingId, a.id);
                    resetDragState();
                  }}
                  onDragEnd={resetDragState}
                  className={`relative bg-white rounded-2xl border border-slate-200 p-4 transition-all ${
                    isDesktopPointer ? 'cursor-grab active:cursor-grabbing' : ''
                  } ${draggingId === a.id ? 'opacity-40' : ''} ${
                    overId === a.id && draggingId && draggingId !== a.id
                      ? 'ring-2 ring-brand-300'
                      : ''
                  }`}
                >
                  {isDesktopPointer && (
                    <GripVertical size={14} className="absolute top-4 right-4 text-slate-300" />
                  )}
                  <p className="font-semibold text-slate-800 pr-5">{a.name}</p>
                  <p className="text-xs text-slate-400 mb-2">
                    {ASSET_CLASS_LABELS[a.assetClass]}
                    {a.institution ? ` · ${a.institution}` : ''}
                    {a.interestRate ? ` · ${a.interestRate}% p.a.` : ''}
                    {a.maturityDate && !isMatured ? ` · Matures ${a.maturityDate}` : ''}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {maskPreciseAmount(value, a.currency, privacyMode)}
                  </p>
                  {maturityAmount !== undefined && !isMatured && (
                    <p className="text-xs text-brand-600 font-medium mt-0.5">
                      Maturity amount: {maskPreciseAmount(maturityAmount, a.currency, privacyMode)}
                    </p>
                  )}
                  {pnlPercent !== undefined && (
                    <p className={`text-xs font-medium ${pnl! >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                      {pnl! >= 0 ? '+' : ''}
                      {pnlPercent.toFixed(1)}%
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => handleMove(a.id, 'up')}
                      disabled={idx === 0}
                      title="Move up"
                      className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-transparent rounded-md p-1 transition-colors"
                    >
                      <ChevronUp size={16} />
                    </button>
                    <button
                      onClick={() => handleMove(a.id, 'down')}
                      disabled={idx === filtered.length - 1}
                      title="Move down"
                      className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 disabled:text-slate-300 disabled:border-slate-200 disabled:hover:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-transparent rounded-md p-1 transition-colors"
                    >
                      <ChevronDown size={16} />
                    </button>
                    <button
                      onClick={() => openEdit(a)}
                      title="Edit"
                      className="text-slate-600 border border-slate-300 hover:text-brand-700 hover:border-brand-400 hover:bg-brand-50 rounded-md p-1 transition-colors"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      onClick={() => setConfirmDeleteAsset(a)}
                      title="Delete"
                      className="text-slate-600 border border-slate-300 hover:text-red-600 hover:border-red-400 hover:bg-red-50 rounded-md p-1 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      ) : null}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Asset" widthClassName="max-w-xl">
        {editing && <AssetDetailsForm initial={editing} onSave={handleSave} />}
      </Modal>

      <Modal
        open={!!confirmDeleteAsset}
        onClose={() => setConfirmDeleteAsset(null)}
        title="Delete this asset?"
      >
        <p className="text-sm text-slate-500 mb-6">
          This will permanently delete <strong>{confirmDeleteAsset?.name}</strong>. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmDeleteAsset(null)}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (confirmDeleteAsset) await handleDelete(confirmDeleteAsset.id);
              setConfirmDeleteAsset(null);
            }}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </Modal>

      <Modal
        open={confirmBulkDeleteOpen}
        onClose={() => setConfirmBulkDeleteOpen(false)}
        title={`Delete ${selectedIds.size} asset${selectedIds.size === 1 ? '' : 's'}?`}
      >
        <p className="text-sm text-slate-500 mb-6">
          {selectedIds.size === filtered.length && filtered.length === assets.length
            ? 'This will permanently delete every asset in your portfolio.'
            : `This will permanently delete the ${selectedIds.size} selected asset${
                selectedIds.size === 1 ? '' : 's'
              }.`}{' '}
          This can't be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmBulkDeleteOpen(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              for (const id of selectedIds) {
                await handleDelete(id);
              }
              setSelectedIds(new Set());
              setConfirmBulkDeleteOpen(false);
            }}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete All Selected
          </button>
        </div>
      </Modal>
    </div>
  );
}

/**
 * Full-page asset detail view shown when a row is tapped in the mobile list.
 * Note: ISIN / sector / geography aren't in the current `Asset` type, so they're
 * read defensively via an `any` cast and only rendered when present — extend the
 * schema with those fields to have them show up here for real.
 */
function AssetDetailPage({
  asset,
  onBack,
  onEdit,
  onDelete,
}: {
  asset: Asset;
  onBack: () => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
}) {
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const extra = asset as unknown as {
    isin?: string;
    sector?: string;
    geography?: string;
    notes?: string;
  };

  const { invested, value, pnl, pnlPercent } = resolveAssetValues(asset, livePrices, sipValues);
  const category = ASSET_CLASS_TO_CATEGORY[asset.assetClass];
  const positive = (pnl ?? 0) >= 0;

  const notesLine = [
    extra.isin ? `ISIN: ${extra.isin}` : null,
    extra.sector ? `Sector: ${extra.sector.toUpperCase()}` : null,
    pnl !== undefined
      ? `P&L: ${pnl >= 0 ? '+' : ''}${formatPreciseCurrency(pnl, asset.currency)}${
          pnlPercent !== undefined ? ` (${pnl >= 0 ? '+' : ''}${pnlPercent.toFixed(4)}%)` : ''
        }`
      : null,
    extra.notes ?? null,
  ]
    .filter(Boolean)
    .join(' | ');

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 text-slate-500 shrink-0">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase truncate">{asset.name}</h2>
          <p className="text-slate-400 text-sm">{category?.label ?? ASSET_CLASS_LABELS[asset.assetClass]}</p>
        </div>
        <button
          onClick={() => onEdit(asset)}
          title="Edit"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 shrink-0"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          title="Delete"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-green-600 hover:bg-green-50 shrink-0"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Delete this asset?">
        <p className="text-sm text-slate-500 mb-6">
          This will permanently delete <strong>{asset.name}</strong>. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmDeleteOpen(false)}
            className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirmDeleteOpen(false);
              onDelete(asset.id);
            }}
            className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </Modal>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block bg-blue-50 text-blue-600 text-xs font-medium px-2.5 py-1 rounded-full">
            {category?.label ?? ASSET_CLASS_LABELS[asset.assetClass]}
          </span>
          <div className="text-right">
            <p className="text-xs text-slate-400 font-medium">INVESTED</p>
            <p className="text-base font-semibold text-slate-800">
              {formatPreciseCurrency(invested ?? value, asset.currency)}
            </p>
          </div>
        </div>
        <p className="text-3xl font-bold text-slate-900 mt-3">
          {maskPreciseAmount(value, asset.currency, privacyMode)}
        </p>
        {pnl !== undefined && (
          <p className={`flex items-center gap-1 text-sm font-medium mt-1 ${positive ? 'text-brand-600' : 'text-red-500'}`}>
            {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {positive ? '+' : ''}
            {formatPreciseCurrency(pnl, asset.currency)}
            {pnlPercent !== undefined && ` (${positive ? '+' : ''}${pnlPercent.toFixed(1)}%)`}
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <p className="text-xs font-semibold tracking-wide text-slate-400 mb-4">DETAILS</p>
        <div className="grid grid-cols-2 gap-y-4 gap-x-4">
          <DetailField label="PRODUCT TYPE" value={ASSET_CLASS_LABELS[asset.assetClass]} />
          <DetailField label="CURRENCY" value={asset.currency} />
          {asset.quantity !== undefined && (
            <DetailField
              label="QUANTITY"
              value={
                WEIGHT_TRACKED_CLASSES.has(asset.assetClass)
                  ? `${formatGrams(asset.quantity)} g`
                  : `${asset.quantity}`
              }
            />
          )}
          {asset.avgCost !== undefined && (
            <DetailField label="PURCHASE PRICE" value={formatPreciseCurrency(asset.avgCost, asset.currency)} />
          )}
          {extra.geography && <DetailField label="GEOGRAPHY" value={extra.geography} />}
          {asset.institution && <DetailField label="INSTITUTION" value={asset.institution} />}
          {asset.interestRate !== undefined && (
            <DetailField label="INTEREST RATE" value={`${asset.interestRate}% p.a.`} />
          )}
          {asset.maturityDate && <DetailField label="MATURITY DATE" value={asset.maturityDate} />}
        </div>
      </div>

      {notesLine && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-xs font-semibold tracking-wide text-slate-400 mb-3">NOTES</p>
          <p className="text-sm text-slate-600 leading-relaxed">{notesLine}</p>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className="text-sm font-medium text-slate-800">{value}</p>
    </div>
  );
}

/**
 * Shared asset details form. Used two ways:
 *  - Step 2 of the Add Asset flow: `category`/`initialType` are supplied, `onBack` returns to Step 1.
 *  - The Edit Asset modal: `initial` is supplied, category/type are derived from it, no `onBack`.
 */
function AssetDetailsForm({
  category,
  initial,
  initialType,
  onBack,
  onSave,
}: {
  category?: CategoryDef<AssetClass>;
  initial: Asset | null;
  initialType?: AssetClass;
  onBack?: () => void;
  onSave: (a: Asset) => void;
}) {
  const startClass: AssetClass = initial?.assetClass ?? initialType ?? 'stock';
  const effectiveCategory = category ?? ASSET_CLASS_TO_CATEGORY[startClass];

  const [name, setName] = useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass>(startClass);
  const [value, setValue] = useState(initial?.value?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '');
  const [avgCost, setAvgCost] = useState(initial?.avgCost?.toString() ?? '');
  const [investedValue, setInvestedValue] = useState(initial?.investedValue?.toString() ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  const [interestRate, setInterestRate] = useState(initial?.interestRate?.toString() ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? '');
  const [monthlyInstallment, setMonthlyInstallment] = useState(
    initial?.monthlyInstallment?.toString() ?? ''
  );
  const [sipAmount, setSipAmount] = useState(initial?.sipAmount?.toString() ?? '');
  const [sipFrequency, setSipFrequency] = useState<'monthly' | 'quarterly'>(
    initial?.sipFrequency ?? 'monthly'
  );
  const [sipDay, setSipDay] = useState(initial?.sipDay?.toString() ?? '');

  // --- Weight-tracked purchases (Gold / Silver / Platinum) ---------------
  // Each buy is its own lot (grams + amount); totals are summed below.
  // An older gold entry with no lots yet but existing quantity/investedValue
  // is backfilled as a single lot so no data is lost.
  const [purchaseLots, setPurchaseLots] = useState<
    { id: string; date?: string; grams: string; amount: string }[]
  >(() => {
    if (initial?.purchaseLots?.length) {
      return initial.purchaseLots.map((l) => ({
        id: l.id,
        date: l.date,
        grams: l.grams?.toString() ?? '',
        amount: l.amount?.toString() ?? '',
      }));
    }
    if (WEIGHT_TRACKED_CLASSES.has(startClass) && (initial?.quantity || initial?.investedValue)) {
      return [
        {
          id: crypto.randomUUID(),
          date: initial?.startDate,
          grams: initial?.quantity?.toString() ?? '',
          amount: initial?.investedValue?.toString() ?? '',
        },
      ];
    }
    return WEIGHT_TRACKED_CLASSES.has(startClass) ? [{ id: crypto.randomUUID(), grams: '', amount: '' }] : [];
  });
  const isWeightTracked = WEIGHT_TRACKED_CLASSES.has(assetClass);
  // Round to 4 decimal places (0.1 mg precision — plenty for jewellery/coins)
  // to avoid floating-point addition artifacts like 0.454099999999999995.
  const totalGrams = Math.round(
    purchaseLots.reduce((sum, l) => sum + (Number(l.grams) || 0), 0) * 10000
  ) / 10000;
  const totalPurchaseAmount = purchaseLots.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

  const addPurchaseLot = () =>
    setPurchaseLots((rows) => [...rows, { id: crypto.randomUUID(), grams: '', amount: '' }]);
  const removePurchaseLot = (id: string) =>
    setPurchaseLots((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const updatePurchaseLot = (id: string, patch: Partial<{ date: string; grams: string; amount: string }>) =>
    setPurchaseLots((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // Quantity (grams) and Invested always mirror the lot totals — they're
  // pure sums, never hand-typed for weight-tracked assets. Current Value
  // defaults to the total paid but is left alone once the person edits it,
  // so today's market rate can differ from cost without being overwritten.
  const valueTouchedRef = useRef(false);
  useEffect(() => {
    if (!isWeightTracked) return;
    setQuantity(totalGrams > 0 ? String(totalGrams) : '');
    setInvestedValue(totalPurchaseAmount > 0 ? String(totalPurchaseAmount) : '');
    if (!valueTouchedRef.current) setValue(totalPurchaseAmount > 0 ? String(totalPurchaseAmount) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeightTracked, totalGrams, totalPurchaseAmount]);

  // Whether the person tried to save at least once — required-field errors
  // only show up after this, so the form doesn't look "broken" on first view.
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);

  // --- Fund search (SIP) -------------------------------------------------
  // `symbol` doubles as the mfapi.in scheme code once a fund is linked
  // (mirrors how stocks store an NSE ticker in the same field). `fundQuery`
  // is just the text shown in the search box, which starts out as the
  // matched fund's name (or the raw legacy symbol for older entries).
  const initialSymbolIsCode = !!initial?.symbol && /^\d+$/.test(initial.symbol);
  const [fundQuery, setFundQuery] = useState(initialSymbolIsCode ? '' : initial?.symbol ?? '');
  const [fundSuggestions, setFundSuggestions] = useState<MfSearchResult[]>([]);
  const [fundSearchOpen, setFundSearchOpen] = useState(false);
  const [fundSearchLoading, setFundSearchLoading] = useState(false);
  const [fundSearchFailed, setFundSearchFailed] = useState(false);
  const [fundSearchedQuery, setFundSearchedQuery] = useState('');
  const [matchedFundName, setMatchedFundName] = useState<string | null>(null);
  const fundQueryTouched = useRef(false);

  // --- Auto-calculated Current Value (SIP) -------------------------------
  const [liveValueLoading, setLiveValueLoading] = useState(false);
  const [liveValueError, setLiveValueError] = useState(false);
  const isSip = SIP_CLASSES.has(assetClass);
  const fundIsLinked = isSip && /^\d+$/.test(symbol);

  // Resolve the fund name for an already-linked scheme code (edit mode).
  useEffect(() => {
    if (!initialSymbolIsCode || !initial?.symbol) return;
    let cancelled = false;
    fetchFundNavHistory(Number(initial.symbol), initial.startDate).then((nav) => {
      if (!cancelled && nav) {
        setMatchedFundName(nav.schemeName);
        setFundQuery(nav.schemeName);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced fund search-as-you-type.
  useEffect(() => {
    if (!isSip || !fundQueryTouched.current) return;
    if (fundIsLinked && fundQuery === matchedFundName) return; // just selected, don't re-search
    const q = fundQuery.trim();
    if (q.length < 3) {
      setFundSuggestions([]);
      return;
    }
    setFundSearchLoading(true);
    const timer = setTimeout(() => {
      searchMutualFunds(q).then((results) => {
        setFundSearchLoading(false);
        setFundSearchedQuery(q);
        if (results === null) {
          setFundSearchFailed(true);
          setFundSuggestions([]);
        } else {
          setFundSearchFailed(false);
          setFundSuggestions(results);
        }
        setFundSearchOpen(true);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fundQuery, isSip]);

  const selectFund = (fund: MfSearchResult) => {
    setSymbol(String(fund.schemeCode));
    setFundQuery(fund.schemeName);
    setMatchedFundName(fund.schemeName);
    setFundSuggestions([]);
    setFundSearchOpen(false);
    if (!name.trim()) setName(fund.schemeName);
  };

  const unlinkFund = () => {
    setSymbol('');
    setFundQuery('');
    setMatchedFundName(null);
    setLiveValueError(false);
  };

  // Auto-calculate Current Value for SIPs: buy units at the NAV in effect
  // on each installment date, then price the total at the latest NAV. Falls
  // back to "invested so far" when no fund is linked yet or the fetch fails,
  // so the field is never something the person has to type in themselves.
  useEffect(() => {
    if (!isSip) return;

    if (!fundIsLinked) {
      setLiveValueError(false);
      setLiveValueLoading(false);
      const invested = investedValue ? Number(investedValue) : 0;
      const amount = sipAmount ? Number(sipAmount) : 0;
      const elapsed =
        amount > 0 && startDate
          ? computeSipProgress({
              id: '',
              name,
              assetClass,
              value: 0,
              currency,
              investedValue: invested || undefined,
              startDate,
              sipAmount: amount,
              sipFrequency,
              sipDay: sipDay ? Number(sipDay) : undefined,
              updatedAt: 0,
            }).totalInvested
          : invested;
      setValue(elapsed ? String(elapsed) : '');
      return;
    }

    const installments = listSipInstallments({
      startDate: startDate || undefined,
      sipAmount: sipAmount ? Number(sipAmount) : undefined,
      sipFrequency,
      sipDay: sipDay ? Number(sipDay) : undefined,
      investedValue: investedValue ? Number(investedValue) : undefined,
    });
    if (installments.length === 0) {
      setValue(investedValue || '');
      return;
    }

    let cancelled = false;
    setLiveValueLoading(true);
    setLiveValueError(false);
    const timer = setTimeout(() => {
      fetchFundNavHistory(Number(symbol), startDate || undefined).then((nav) => {
        if (cancelled) return;
        setLiveValueLoading(false);
        if (!nav) {
          setLiveValueError(true);
          return;
        }
        const { value: liveValue } = computeSipLiveValue(installments, nav);
        setValue(liveValue.toFixed(2));
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSip, fundIsLinked, symbol, sipAmount, sipFrequency, sipDay, startDate, investedValue]);

  const estimatedMaturityValue = DEPOSIT_LIKE_CLASSES.has(assetClass)
    ? computeMaturityInfo({
        id: initial?.id ?? '',
        name,
        assetClass,
        value: Number(value) || 0,
        currency,
        investedValue: investedValue ? Number(investedValue) : undefined,
        interestRate: interestRate ? Number(interestRate) : undefined,
        startDate: startDate || undefined,
        maturityDate: maturityDate || undefined,
        updatedAt: 0,
      }).maturityAmount
    : undefined;

  const sipProgress = SIP_CLASSES.has(assetClass)
    ? computeSipProgress({
        id: initial?.id ?? '',
        name,
        assetClass,
        value: Number(value) || 0,
        currency,
        investedValue: investedValue ? Number(investedValue) : undefined,
        startDate: startDate || undefined,
        sipAmount: sipAmount ? Number(sipAmount) : undefined,
        sipFrequency,
        sipDay: sipDay ? Number(sipDay) : undefined,
        updatedAt: 0,
      })
    : undefined;

  const nameMissing = !name.trim();
  // SIP's Current Value is auto-calculated, so it's never a required
  // hand-typed field — everything else still needs a value to save.
  const valueMissing = !isSip && !value.trim();
  const hasErrors = nameMissing || valueMissing;

  const submit = () => {
    setAttemptedSubmit(true);
    if (hasErrors) return;
    const qty = quantity ? Number(quantity) : undefined;
    const avg = avgCost ? Number(avgCost) : undefined;
    const invested = investedValue
      ? Number(investedValue)
      : qty && avg && qty > 0 && avg > 0
        ? qty * avg
        : undefined;

    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      assetClass,
      value: Number(value),
      currency,
      symbol: symbol.trim().toUpperCase() || undefined,
      quantity: qty,
      avgCost: avg,
      investedValue: invested,
      pnl: invested !== undefined ? Number(value) - invested : undefined,
      pnlPercent:
        invested !== undefined && invested > 0
          ? ((Number(value) - invested) / invested) * 100
          : undefined,
      institution: institution.trim() || undefined,
      interestRate: interestRate ? Number(interestRate) : undefined,
      startDate: startDate || undefined,
      maturityDate: maturityDate || undefined,
      monthlyInstallment: monthlyInstallment ? Number(monthlyInstallment) : undefined,
      sipAmount: sipAmount ? Number(sipAmount) : undefined,
      sipFrequency: SIP_CLASSES.has(assetClass) ? sipFrequency : undefined,
      sipDay: sipDay ? Number(sipDay) : undefined,
      order: initial?.order,
      updatedAt: Date.now(),
      purchaseLots: isWeightTracked
        ? purchaseLots
            .filter((l) => Number(l.grams) > 0 || Number(l.amount) > 0)
            .map((l) => ({
              id: l.id,
              date: l.date || undefined,
              grams: Number(l.grams) || 0,
              amount: Number(l.amount) || 0,
            }))
        : undefined,
    });
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 -mt-1"
        >
          <ArrowLeft size={16} /> Back to asset type
        </button>
      )}
      <Field label="Name">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={`${inputClass} ${attemptedSubmit && nameMissing ? errorInputClass : ''}`}
          placeholder="e.g. HDFC Flexicap SIP"
        />
        {attemptedSubmit && nameMissing && <p className={errorTextClass}>Name is required.</p>}
      </Field>
      {initial ? (
        <Field label="Asset Type">
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as AssetClass)}
            className={`${inputClass} bg-white text-slate-700`}
          >
            {ASSET_TAXONOMY.map((cat) => (
              <optgroup key={cat.key} label={cat.label}>
                {cat.types.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {ASSET_CLASS_TO_CATEGORY[assetClass]?.key !== effectiveCategory?.key && (
            <p className="text-xs text-amber-600 mt-1.5">
              This will move the asset from {effectiveCategory?.label} to{' '}
              {ASSET_CLASS_TO_CATEGORY[assetClass]?.label}.
            </p>
          )}
        </Field>
      ) : effectiveCategory && effectiveCategory.types.length > 1 ? (
        <Field label={`${effectiveCategory.label} Type`}>
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value as AssetClass)}
            className={`${inputClass} bg-white text-slate-700`}
          >
            {!effectiveCategory.types.some((t) => t.value === assetClass) && (
              <option value={assetClass}>{ASSET_CLASS_LABELS[assetClass] ?? assetClass}</option>
            )}
            {effectiveCategory.types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Asset Type">
          <p className="text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50">
            {ASSET_CLASS_LABELS[assetClass] ?? assetClass ?? 'Unknown'}
          </p>
        </Field>
      )}
      {isWeightTracked && (
        <div className="space-y-3 border border-slate-100 bg-slate-50/60 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-slate-700">Purchases</p>
            <p className="text-xs text-slate-500">
              Total: <span className="font-semibold text-brand-700">{totalGrams || 0} g</span>
              {' · '}
              {formatPreciseCurrency(totalPurchaseAmount, currency)}
            </p>
          </div>
          <div className="space-y-2">
            {purchaseLots.map((lot, i) => (
              <div key={lot.id} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end">
                <Field label={i === 0 ? 'Date' : ''}>
                  <input
                    type="date"
                    value={lot.date ?? ''}
                    onChange={(e) => updatePurchaseLot(lot.id, { date: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label={i === 0 ? 'Grams' : ''}>
                  <input
                    type="number"
                    step="any"
                    value={lot.grams}
                    onChange={(e) => updatePurchaseLot(lot.id, { grams: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. 10"
                  />
                </Field>
                <Field label={i === 0 ? 'Amount Paid' : ''}>
                  <input
                    type="number"
                    step="any"
                    value={lot.amount}
                    onChange={(e) => updatePurchaseLot(lot.id, { amount: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. 65000"
                  />
                </Field>
                <button
                  type="button"
                  onClick={() => removePurchaseLot(lot.id)}
                  disabled={purchaseLots.length === 1}
                  className="h-[42px] w-[42px] shrink-0 flex items-center justify-center border border-slate-200 rounded-lg text-slate-400 hover:text-green-600 hover:border-green-200 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove this purchase"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addPurchaseLot}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus size={16} /> Add another purchase
          </button>
          <p className="text-xs text-slate-400">
            Bought more later? Come back to Edit and add another purchase row — grams and amount add
            up automatically.
          </p>
        </div>
      )}
      {SYMBOL_ENABLED_CLASSES.has(assetClass) && !SIP_CLASSES.has(assetClass) && !isWeightTracked && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Symbol (for live price)">
            <input value={symbol} onChange={(e) => setSymbol(e.target.value)} className={inputClass} placeholder="RELIANCE" />
          </Field>
          <Field label="Quantity">
            <input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} className={inputClass} placeholder="0" />
          </Field>
          <Field label="Avg. Cost">
            <input type="number" step="any" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} className={inputClass} placeholder="0.00" />
          </Field>
        </div>
      )}
      {SIP_CLASSES.has(assetClass) && (
        <div className="space-y-4 border border-slate-100 bg-slate-50/60 rounded-xl p-4">
          <Field label="Fund Name / Symbol (for live price)">
            <div className="relative">
              <input
                value={fundQuery}
                onChange={(e) => {
                  fundQueryTouched.current = true;
                  setFundQuery(e.target.value);
                  if (fundIsLinked) setSymbol(''); // typing again un-links the previous match
                  setMatchedFundName(null);
                }}
                onFocus={() => fundSuggestions.length > 0 && setFundSearchOpen(true)}
                onBlur={() => setTimeout(() => setFundSearchOpen(false), 150)}
                className={`${inputClass} ${fundIsLinked ? 'pr-9' : ''}`}
                placeholder="Start typing a fund name, e.g. HDFC Flexicap"
                autoComplete="off"
                title={fundQuery}
              />
              {fundSearchLoading && (
                <Loader2
                  size={16}
                  className="animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
              {!fundSearchLoading && fundIsLinked && (
                <CheckCircle2
                  size={16}
                  className="text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
              {fundSearchOpen && fundSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                  {fundSuggestions.map((f) => (
                    <button
                      key={f.schemeCode}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectFund(f)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-slate-100 last:border-0"
                    >
                      {f.schemeName}
                    </button>
                  ))}
                </div>
              )}
              {fundSearchOpen &&
                !fundSearchLoading &&
                fundSuggestions.length === 0 &&
                fundQuery.trim() === fundSearchedQuery &&
                fundQuery.trim().length >= 3 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-sm">
                    {fundSearchFailed ? (
                      <span className="text-red-500">
                        Couldn't reach the fund search — check your connection, or restart the dev
                        server if you just updated the app.
                      </span>
                    ) : (
                      <span className="text-slate-400">
                        No funds matched "{fundSearchedQuery}". Try the AMC name alone, e.g. "HDFC".
                      </span>
                    )}
                  </div>
                )}
            </div>
            {fundIsLinked ? (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                Linked to {matchedFundName ?? 'this fund'} — Current Value updates automatically.{' '}
                <button type="button" onClick={unlinkFund} className="text-slate-400 hover:text-slate-600 underline">
                  unlink
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <Link2Off size={12} /> Not linked yet — pick a fund from the list to track its live NAV.
              </p>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="SIP Amount (per installment)">
              <input
                type="number"
                step="any"
                value={sipAmount}
                onChange={(e) => setSipAmount(e.target.value)}
                className={inputClass}
                placeholder="5000"
              />
            </Field>
            <Field label="Frequency">
              <select
                value={sipFrequency}
                onChange={(e) => setSipFrequency(e.target.value as 'monthly' | 'quarterly')}
                className={inputClass}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="SIP Date (day of month)">
              <input
                type="number"
                min={1}
                max={31}
                step={1}
                value={sipDay}
                onChange={(e) => setSipDay(e.target.value)}
                className={inputClass}
                placeholder="e.g. 5"
              />
            </Field>
          </div>
          {sipProgress && sipProgress.installmentsElapsed > 0 && (
            <p className="text-xs text-slate-500">
              Invested so far:{' '}
              <span className="font-semibold text-brand-700">
                {formatPreciseCurrency(sipProgress.totalInvested, currency)}
              </span>{' '}
              ({sipProgress.installmentsElapsed} installment
              {sipProgress.installmentsElapsed === 1 ? '' : 's'} since start — updates automatically)
            </p>
          )}
        </div>
      )}
      {DEPOSIT_LIKE_CLASSES.has(assetClass) && (
        <div className="space-y-4 border border-slate-100 bg-slate-50/60 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank / Institution">
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className={inputClass}
                placeholder="e.g. HDFC Bank"
              />
            </Field>
            <Field label="Interest Rate (% p.a.)">
              <input
                type="number"
                step="any"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className={inputClass}
                placeholder="7.10"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="Maturity Date">
              <input
                type="date"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          {RECURRING_DEPOSIT_CLASSES.has(assetClass) && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Monthly Installment">
                <input
                  type="number"
                  step="any"
                  value={monthlyInstallment}
                  onChange={(e) => setMonthlyInstallment(e.target.value)}
                  className={inputClass}
                  placeholder="0"
                />
              </Field>
            </div>
          )}
          {estimatedMaturityValue !== undefined && (
            <p className="text-xs text-slate-500">
              Maturity amount:{' '}
              <span className="font-semibold text-brand-700">
                {formatPreciseCurrency(estimatedMaturityValue, currency)}
              </span>{' '}
              (simple-interest estimate over the full term from start date to maturity date — actual payout may vary)
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={isSip ? 'Current Value (auto)' : 'Current Value'}>
          {isSip ? (
            <div className="relative">
              <input
                type="text"
                readOnly
                value={
                  liveValueLoading
                    ? 'Calculating…'
                    : value
                      ? formatPreciseCurrency(Number(value), currency)
                      : '—'
                }
                className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
              />
              {liveValueLoading && (
                <Loader2
                  size={16}
                  className="animate-spin text-slate-400 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
            </div>
          ) : (
            <input
              type="number"
              step="any"
              value={value}
              onChange={(e) => {
                valueTouchedRef.current = true;
                setValue(e.target.value);
              }}
              className={`${inputClass} ${attemptedSubmit && valueMissing ? errorInputClass : ''}`}
              placeholder="0"
            />
          )}
          {isWeightTracked && (
            <p className="text-xs text-slate-400 mt-1">
              Defaults to total amount paid ({formatPreciseCurrency(totalPurchaseAmount, currency)}) — edit if today's market value is different.
            </p>
          )}
          {isSip && fundIsLinked && !liveValueLoading && !liveValueError && (
            <p className="text-xs text-slate-400 mt-1">Calculated from the fund's live NAV × units bought each installment.</p>
          )}
          {isSip && !fundIsLinked && !liveValueLoading && (
            <p className="text-xs text-slate-400 mt-1">Link a fund above for a live value — using amount invested so far for now.</p>
          )}
          {isSip && liveValueError && (
            <p className={errorTextClass}>Couldn't fetch this fund's live NAV — using amount invested so far instead.</p>
          )}
          {!isSip && attemptedSubmit && valueMissing && <p className={errorTextClass}>Current Value is required.</p>}
        </Field>
        <Field
          label={
            SIP_CLASSES.has(assetClass)
              ? 'Initial Investment Amount'
              : isWeightTracked
                ? 'Invested (auto, from purchases)'
                : 'Invested (optional)'
          }
        >
          <input
            type="number"
            step="any"
            value={investedValue}
            readOnly={isWeightTracked}
            onChange={(e) => !isWeightTracked && setInvestedValue(e.target.value)}
            className={`${inputClass} ${isWeightTracked ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : ''}`}
            placeholder={SIP_CLASSES.has(assetClass) ? '0' : 'Auto: Qty × Avg'}
          />
        </Field>
      </div>
      <Field label="Currency">
        <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      {attemptedSubmit && hasErrors && (
        <p className="text-sm text-red-600 text-center">
          Please fill in the highlighted field{nameMissing && valueMissing ? 's' : ''} before saving.
        </p>
      )}
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Asset
      </button>
    </div>
  );
}

function LiabilitiesTab({
  tab,
  setTab,
  onAdd,
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  onAdd: () => void;
}) {
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const liabilities = activeProfileId
    ? allLiabilities.filter((l) => l.profileId === activeProfileId)
    : allLiabilities;
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Liability | null>(null);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'liabilities', id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await handleDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleSave = async (liability: Liability) => {
    if (!user) return;
    try {
      await upsertDoc(user.uid, 'liabilities', liability);
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save liability', err);
      alert('Could not save this liability. Please check your connection and try again.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Liabilities</h2>
          <p className="text-slate-500 text-sm mt-0.5">
            {liabilities.length} active ·{' '}
            {formatPreciseCurrency(liabilities.reduce((s, l) => s + l.outstanding, 0))} outstanding
          </p>
        </div>
        <button
          onClick={onAdd}
          className="w-full sm:w-auto justify-center flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
        >
          <Plus size={18} /> Add Liability
        </button>
      </div>

      <TabNav tab={tab} setTab={setTab} />

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-base min-w-[820px]">
          <thead className="bg-slate-50 text-slate-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Type</th>
              <th className="px-4 py-3 font-medium">Outstanding</th>
              <th className="px-4 py-3 font-medium">EMI</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {liabilities.map((l) => (
              <tr key={l.id}>
                <td className="px-4 py-3 font-medium text-slate-800">{l.name}</td>
                <td className="px-4 py-3 text-slate-500">
                  {l.liabilityClass ? LIABILITY_CLASS_LABELS[l.liabilityClass] : '—'}
                </td>
                <td className="px-4 py-3 text-slate-800">{formatPreciseCurrency(l.outstanding, l.currency)}</td>
                <td className="px-4 py-3 text-slate-500">{l.emi ? formatPreciseCurrency(l.emi, l.currency) : '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3 justify-end">
                    <button
                      onClick={() => {
                        setEditing(l);
                        setModalOpen(true);
                      }}
                      className="text-slate-400 hover:text-brand-600"
                    >
                      <Pencil size={18} />
                    </button>
                    <button onClick={() => setPendingDelete(l)} className="text-slate-400 hover:text-green-600">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {liabilities.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-14">
                  <div className="flex flex-col items-center justify-center text-center gap-4">
                    <p className="text-slate-400">No liabilities tracked. Add loans or credit lines here.</p>
                    <button
                      onClick={onAdd}
                      className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2.5 rounded-lg text-base font-medium"
                    >
                      <Plus size={18} /> Add Liability
                    </button>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Liability">
        {editing && <LiabilityDetailsForm initial={editing} onSave={handleSave} />}
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete this liability?"
        description={<>This will permanently delete <strong>{pendingDelete?.name}</strong>. This can't be undone.</>}
      />
    </div>
  );
}

/**
 * Shared liability details form. Used for Step 2 of the Add Liability flow
 * (`category`/`initialType` supplied, `onBack` returns to Step 1) and for the
 * Edit Liability modal (`initial` supplied, category/type derived from it).
 */
function LiabilityDetailsForm({
  category,
  initial,
  initialType,
  onBack,
  onSave,
}: {
  category?: CategoryDef<LiabilityClass>;
  initial: Liability | null;
  initialType?: LiabilityClass;
  onBack?: () => void;
  onSave: (l: Liability) => void;
}) {
  const startClass: LiabilityClass = initial?.liabilityClass ?? initialType ?? 'other_liability';
  const effectiveCategory = category ?? LIABILITY_CLASS_TO_CATEGORY[startClass];

  const [name, setName] = useState(initial?.name ?? '');
  const [liabilityClass, setLiabilityClass] = useState<LiabilityClass>(startClass);
  const [outstanding, setOutstanding] = useState(initial?.outstanding?.toString() ?? '');
  const [emi, setEmi] = useState(initial?.emi?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');

  const submit = () => {
    if (!name || !outstanding) return;
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      name,
      liabilityClass,
      outstanding: Number(outstanding),
      emi: emi ? Number(emi) : undefined,
      currency,
      updatedAt: Date.now(),
    });
  };

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 -mt-1"
        >
          <ArrowLeft size={16} /> Back to liability type
        </button>
      )}
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. Home Loan" />
      </Field>
      {effectiveCategory && effectiveCategory.types.length > 1 ? (
        <Field label={`${effectiveCategory.label} Type`}>
          <select
            value={liabilityClass}
            onChange={(e) => setLiabilityClass(e.target.value as LiabilityClass)}
            className={inputClass}
          >
            {effectiveCategory.types.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field label="Liability Type">
          <p className="text-sm font-medium text-slate-700 border border-slate-200 rounded-lg px-3 py-2.5 bg-slate-50">
            {LIABILITY_CLASS_LABELS[liabilityClass]}
          </p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Outstanding">
          <input type="number" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Currency">
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={inputClass}>
            {CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Monthly EMI (optional)">
        <input type="number" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-base font-medium">
        Save Liability
      </button>
    </div>
  );
}

function NetWorthTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const privacyMode = useUiStore((s) => s.privacyMode);

  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Net Worth</h2>
        <p className="text-slate-500 text-sm mt-0.5">Everything you own and owe, in one view.</p>
      </div>

      <TabNav tab={tab} setTab={setTab} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard
          label="Assets"
          value={maskPreciseAmount(totalAssets, 'INR', privacyMode)}
          tone="brand"
        />
        <SummaryCard
          label="Liabilities"
          value={maskPreciseAmount(totalLiabilities, 'INR', privacyMode)}
          tone="red"
        />
        <SummaryCard
          label="Net Worth"
          value={maskPreciseAmount(netWorth, 'INR', privacyMode)}
          tone="slate"
        />
      </div>
    </div>
  );
}

function AllocationTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const assets = useAssetsStore((s) => s.assets);
  const byClass: Record<string, number> = {};
  assets.forEach((a) => {
    byClass[a.assetClass] = (byClass[a.assetClass] ?? 0) + a.value;
  });
  const data = Object.entries(byClass).map(([key, value]) => ({
    name: ASSET_CLASS_LABELS[key] ?? key,
    value,
    color: ASSET_CLASS_COLORS[key] ?? '#94a3b8',
  }));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Allocation</h2>
        <p className="text-slate-500 text-sm mt-0.5">How your wealth is spread across asset classes.</p>
      </div>

      <TabNav tab={tab} setTab={setTab} />

      {data.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          Add assets to see how your wealth is allocated.
        </div>
      ) : (
        <AllocationChart data={data} total={total} />
      )}
    </div>
  );
}

function AllocationChart({
  data,
  total,
}: {
  data: { name: string; value: number; color: string }[];
  total: number;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={60} outerRadius={110}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => formatPreciseCurrency(Number(v))} />
        </PieChart>
      </ResponsiveContainer>
      <div className="space-y-3">
        {data
          .sort((a, b) => b.value - a.value)
          .map((d) => (
            <div key={d.name} className="flex items-center justify-between text-base">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: d.color }} />
                <span className="text-slate-700 font-medium">{d.name}</span>
              </div>
              <div className="text-right">
                <span className="text-slate-900 font-semibold">{formatPreciseCurrency(d.value)}</span>
                <span className="text-slate-400 ml-2 text-sm">
                  {total > 0 ? Math.round((d.value / total) * 100) : 0}%
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-500 mb-1 block">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-base focus:outline-none focus:ring-2 focus:ring-brand-500';

const errorInputClass = 'border-red-400 focus:ring-red-400';
const errorTextClass = 'text-xs text-red-500 mt-1';
