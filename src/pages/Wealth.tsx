import { useState, useEffect, useLayoutEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
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
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Loader2,
  CheckCircle2,
  Link2Off,
  AlertTriangle,
  EyeOff,
  MoreVertical,
  BarChart2,
  GripVertical,
  ListFilter,
  ArrowDown,
  ArrowUp,
  Info,
  Pause,
  Play,
  PlusCircle,
  Banknote,
  ArrowUpRight,
  Wallet,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore, resolvePreviousClose } from '../store/livePricesStore';
import { goldPricePerGram22k } from '../utils/goldPrice';
import { computeHoldingPnl, computePortfolioPnl, isFullySold } from '../utils/investmentPnl';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import { exportToCsv } from '../utils/exportCsv';
import Modal from '../components/Modal';
import {
  Button,
  Card,
  EmptyState,
  IconButton,
  Input,
  PageHeader,
  StatCard,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tabs,
  SegmentedControl,
  inputClasses,
  fieldBase,
  chart,
} from '../components/ui';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import CurrencySelect from '../components/CurrencySelect';
import CustomSelect from '../components/CustomSelect';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { ACCOUNT_TYPES, resolveAccountIcon, type AccountType } from '../utils/accountVisuals';
import type { Asset, AssetClass, Liability, LiabilityClass, Transaction } from '../types';
import {
  formatPreciseCurrency,
  formatPercentMagnitude,
  formatSignedCurrency,
  maskPreciseAmount,
  maskAmount,
} from '../utils/currency';
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
  MARKET_SELECTABLE_CLASSES,
  RECURRING_ELIGIBLE_CLASSES,
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
import { fetchLivePrices, fetchFxRate, searchStockSymbols, type StockSearchResult } from '../utils/marketPrices';
import { useDayChangeResetWindow, useMarketSessionProgress, useIsMarketOpen } from '../utils/marketHours';
import { useUrlTab } from '../hooks/useUrlTab';
import { useModalBackClose } from '../hooks/useModalBackClose';

type Tab = 'assets' | 'liabilities' | 'networth' | 'allocation';
type SortKey = 'manual' | 'name' | 'qty' | 'avgCost' | 'perUnit' | 'invested' | 'value' | 'pnl' | 'alloc' | 'dayChange';
type EntryType = 'asset' | 'liability';

/** Default manual-order tie-break for holdings that have never been
 *  explicitly reordered (same `order` value, typically 0/unset) — puts
 *  Stock, Gold, SIP, FD, RD and Cash in that fixed order — this rank is
 *  consulted first, so holdings always group by asset class in this order
 *  regardless of any stored drag `order`. Within a class, the stored
 *  `order` (set by dragging or the row menu) decides relative position, so
 *  manual reordering still freely moves a holding anywhere within its own
 *  class, it just can no longer jump into a different class's block. */
const DEFAULT_ASSET_CLASS_ORDER: Partial<Record<AssetClass, number>> = {
  stock: 0,
  gold: 1,
  sip: 2,
  fixed_deposit: 3,
  recurring_deposit: 4,
  cash: 5,
};
const DEFAULT_ASSET_CLASS_ORDER_FALLBACK = 6;

/** Common Indian/US brokers for the "Held in account" dropdown on Stock/ETF
 *  holdings — stored in the same `institution` field the Bank/Institution
 *  field already uses for deposits, so no schema change was needed. */
const COMMON_BROKERS = [
  'Zerodha',
  'Groww',
  'Upstox',
  'ICICI Direct',
  'HDFC Securities',
  'Kotak Securities',
  'Angel One',
  '5paisa',
  'Charles Schwab',
  'Fidelity',
  'Robinhood',
  'Interactive Brokers',
];

const GEOGRAPHY_OPTIONS: { value: Asset['geography']; label: string }[] = [
  { value: 'INDIA', label: 'India' },
  { value: 'USA', label: 'USA' },
  { value: 'CANADA', label: 'Canada' },
  { value: 'EUROPE', label: 'Europe' },
  { value: 'UK', label: 'UK' },
  { value: 'SINGAPORE', label: 'Singapore' },
  { value: 'JAPAN', label: 'Japan' },
  { value: 'CHINA', label: 'China' },
  { value: 'TAIWAN', label: 'Taiwan' },
  { value: 'KOREA', label: 'Korea' },
  { value: 'BRAZIL', label: 'Brazil' },
  { value: 'GLOBAL', label: 'Global' },
  { value: 'OTHER', label: 'Other' },
];
function defaultAssetClassRank(a: Asset): number {
  return DEFAULT_ASSET_CLASS_ORDER[a.assetClass] ?? DEFAULT_ASSET_CLASS_ORDER_FALLBACK;
}

/** Persists the Assets tab's Category/Type/Currency filter selections to
 *  localStorage so they survive a page refresh — a filter only changes when
 *  the person actually changes it, never on reload. */
function loadPersistedFilter(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function savePersistedFilter(key: string, value: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage unavailable (private mode, quota, etc.) — filter just
    // won't survive a refresh, but the app keeps working.
  }
}

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

/** Tiny deterministic PRNG (mulberry32) seeded from a string, so a given
 *  holding's sparkline jaggedness looks the same on every render/refresh
 *  instead of reshuffling — same idea as a real chart being stable
 *  between renders. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/**
 * Builds a jagged, broker-app-style sparkline for a holding. There's no
 * free source of real intraday tick history for NSE symbols (only the
 * current price + previous close), so the path in between is synthetic —
 * but the two endpoints are pinned exactly to the real previous close and
 * real current price, so the overall slope, direction, and total % move
 * always stay accurate even though the individual ticks are stylized.
 * The jitter is deterministic per holding (seeded, not re-randomized on
 * every 10s price refresh) so the line doesn't visibly reshuffle.
 */
function buildSparklinePath(
  seed: string,
  previousClose: number,
  currentPrice: number,
  progress: number,
  width = 108,
  height = 32
): string {
  const rand = seededRandom(seed);
  // Jaggedness resolution stays fixed regardless of how much of the
  // session has elapsed — only how much of the *width* the line covers
  // changes with progress. Otherwise, early in the day there are too few
  // points to draw anything but a single straight diagonal segment.
  const points = 10;
  const priceRange = Math.abs(currentPrice - previousClose) || previousClose * 0.004 || 1;
  const vals: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const base = previousClose + (currentPrice - previousClose) * t;
    if (i === 0 || i === points - 1) {
      // Endpoints stay exact: the line always starts at the real previous
      // close and ends at the real current price, wherever "now" falls.
      vals.push(base);
    } else {
      const jitter = (rand() - 0.5) * priceRange * 1.1;
      vals.push(base + jitter);
    }
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const pad = 3;
  // The line is squeezed into just the elapsed fraction of the width —
  // e.g. ~20% across if the market's been open ~20% of the session —
  // rather than being stretched to fill the whole column before the
  // trading day is actually over. A small floor keeps something visible
  // right at open instead of a zero-width line.
  const visibleWidth = Math.max(6, width * Math.min(1, Math.max(0, progress)));
  return vals
    .map((v, i) => {
      const x = (i / (points - 1)) * visibleWidth;
      const y = pad + (1 - (v - min) / range) * (height - pad * 2);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Small inline sparkline used in the Holdings table — see buildSparklinePath.
 *  width/height are overridable so the compact mobile list can use a
 *  smaller version than the desktop table without duplicating the component. */
function Sparkline({
  seed,
  previousClose,
  currentPrice,
  progress,
  width = 108,
  height = 32,
}: {
  seed: string;
  previousClose: number;
  currentPrice: number;
  progress: number;
  width?: number;
  height?: number;
}) {
  const trendUp = currentPrice >= previousClose;
  const path = buildSparklinePath(seed, previousClose, currentPrice, progress, width, height);
  const stroke = trendUp ? '#10b981' : '#ef4444';
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0" aria-hidden="true">
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Wealth() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useUrlTab<Tab>(['assets', 'liabilities', 'networth', 'allocation'], 'assets');
  const [startCategoryKey, setStartCategoryKey] = useState<string | undefined>();

  const addFlow: EntryType | null =
    searchParams.get('add') === '1'
      ? searchParams.get('entry') === 'liability'
        ? 'liability'
        : 'asset'
      : null;

  // Onboarding's "Add your assets" step hands off a chosen asset category
  // via navigation state so this page can jump straight into Step 2 of the
  // add flow instead of making the person pick the category again.
  useEffect(() => {
    const startAddAsset = (location.state as { startAddAsset?: string } | null)?.startAddAsset;
    if (startAddAsset) {
      setStartCategoryKey(startAddAsset);
      const next = new URLSearchParams(searchParams);
      next.set('add', '1');
      next.set('entry', 'asset');
      next.set('step', 'details');
      next.set('cat', startAddAsset);
      navigate({ pathname: location.pathname, search: next.toString() }, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opening the Add Asset/Liability flow pushes a fresh history entry, so the
  // browser Back button (or the flow's own Back link) steps out of it one
  // screen at a time instead of leaving the whole Wealth page.
  const openAdd = (entryType: EntryType) => {
    const next = new URLSearchParams(searchParams);
    next.set('add', '1');
    next.set('entry', entryType);
    next.set('step', 'category');
    next.delete('cat');
    next.delete('type');
    setSearchParams(next);
  };

  const closeAdd = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('add');
    next.delete('entry');
    next.delete('step');
    next.delete('cat');
    next.delete('type');
    setSearchParams(next, { replace: true });
    setStartCategoryKey(undefined);
  };

  const handleAddAsset = () => {
    openAdd('asset');
  };

  if (addFlow) {
    return (
      <AddWealthPage
        initialEntryType={addFlow}
        initialCategoryKey={startCategoryKey}
        onClose={closeAdd}
      />
    );
  }

  return (
    <div className="space-y-4">
      {tab === 'assets' && (
        <AssetsTab tab={tab} setTab={setTab} onAdd={handleAddAsset} />
      )}
      {tab === 'liabilities' && (
        <LiabilitiesTab tab={tab} setTab={setTab} onAdd={() => openAdd('liability')} />
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
  const [searchParams, setSearchParams] = useSearchParams();

  const entryType: EntryType = searchParams.get('entry') === 'liability' ? 'liability' : initialEntryType;
  const step = (searchParams.get('step') as 'category' | 'type' | 'details' | null) ??
    (initialCategoryKey ? 'details' : 'category');
  const categoryKey = searchParams.get('cat') ?? initialCategoryKey ?? undefined;
  const urlPickedType = searchParams.get('type') ?? undefined;

  const taxonomy = entryType === 'asset' ? ASSET_TAXONOMY : LIABILITY_TAXONOMY;
  const category = taxonomy.find((c) => c.key === categoryKey);
  const pickedType =
    urlPickedType ?? (categoryKey ? taxonomy.find((c) => c.key === categoryKey)?.types[0]?.value : undefined);

  // Every transition pushes a fresh history entry, so the browser Back
  // button (and this flow's own "Back" links) step out one screen at a time
  // — category list -> type tiles -> details form — instead of leaving the
  // whole Add Asset/Liability flow in one go. Refreshing mid-flow re-reads
  // the same state straight from the URL above.
  const pushParams = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([k, v]) => {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    });
    setSearchParams(next);
  };

  const resetToCategory = () => pushParams({ step: 'category', cat: undefined, type: undefined });

  const switchEntryType = (next: EntryType) => {
    if (next === entryType) return;
    pushParams({ entry: next, step: 'category', cat: undefined, type: undefined });
  };

  // Step 1 picks a broad category (Equity, Commodities, ...). If it only has
  // one possible type (Cash, Other), there's nothing to choose so we skip
  // straight to the details form; otherwise show the type tiles for that
  // category (grouped tiles when the category defines `groups`, otherwise
  // one tile per raw type) before moving on to Step 2.
  const selectCategory = (cat: CategoryDef<string>) => {
    if (cat.types.length <= 1) {
      pushParams({ cat: cat.key, type: cat.types[0]?.value, step: 'details' });
    } else {
      pushParams({ cat: cat.key, type: undefined, step: 'type' });
    }
  };

  const selectType = (value: string) => {
    pushParams({ type: value, step: 'details' });
  };

  // From the details form's "Back", return to the type tiles when the
  // category actually has a choice to make, otherwise back to Step 1.
  const backFromDetails = () => {
    if (category && category.types.length > 1) {
      pushParams({ step: 'type', type: undefined });
    } else {
      resetToCategory();
    }
  };

  const handleSaveAsset = async (asset: Asset) => {
    if (!user) return;
    try {
      await upsertDoc(user, 'assets', asset.profileId ? asset : { ...asset, profileId: activeProfileId ?? undefined });
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
      <PageHeader
        title={`Add ${noun.toLowerCase()}`}
        description={`Step ${step === 'details' ? 2 : 1} of 2: ${
          step === 'category'
            ? `Select ${entryType} type`
            : step === 'type'
              ? category?.label ?? `Select ${entryType} type`
              : (category?.types.find((t) => t.value === pickedType)?.label ?? 'Enter details')
        }`}
        onBack={onClose}
        backLabel={`Back to ${nounPlural.toLowerCase()}`}
      />

      <SegmentedControl<'asset' | 'liability'>
        value={entryType}
        onChange={switchEntryType}
        items={[
          { key: 'asset', label: <span className="inline-flex items-center gap-1.5"><TrendingUp size={14} /> Asset</span> },
          { key: 'liability', label: <span className="inline-flex items-center gap-1.5"><TrendingDown size={14} /> Liability</span> },
        ]}
      />

      <div className="bg-surface rounded-2xl border border-line p-6">
        {step === 'category' ? (
          <div className="space-y-4">
            <h3 className="font-semibold text-ink">Select {noun} Type</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {taxonomy.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.key}
                    onClick={() => selectCategory(cat)}
                    className="flex flex-col items-center justify-center gap-2 border border-line rounded-xl p-4 hover:border-brand-400 hover:bg-brand-50 transition-colors text-center"
                  >
                    <Icon size={22} className="text-slate-600" />
                    <span className="font-medium text-ink text-sm">{cat.label}</span>
                    {cat.types.length > 1 && (
                      <span className="text-xs text-slate-600">{cat.types.length} types</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ) : step === 'type' && category ? (
          <div className="space-y-4">
            <button
              onClick={resetToCategory}
              className="flex items-center gap-1 text-sm text-slate-500 hover:text-brand-600"
            >
              <ArrowLeft size={14} /> All categories
            </button>
            <h3 className="font-semibold text-ink">{category.label}</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(category.groups
                ? category.groups.map((g) => ({ value: g.defaultValue, label: g.label }))
                : category.types
              ).map((t) => (
                <button
                  key={t.value}
                  onClick={() => selectType(t.value)}
                  className="border border-line rounded-xl px-4 py-3.5 text-sm font-medium text-ink text-center hover:border-brand-400 hover:bg-brand-50 transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        ) : entryType === 'asset' ? (
          <AssetDetailsForm
            category={category as CategoryDef<AssetClass> | undefined}
            initial={null}
            initialType={pickedType as AssetClass}
            onBack={backFromDetails}
            onSave={handleSaveAsset}
          />
        ) : (
          <LiabilityDetailsForm
            category={category as CategoryDef<LiabilityClass> | undefined}
            initial={null}
            initialType={pickedType as LiabilityClass}
            onBack={backFromDetails}
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
    // Uses 'click' rather than 'mousedown'. On mobile, a tap synthesizes
    // mousedown before click — if we close (and unmount) the menu on
    // mousedown, the browser can lose the element it was about to fire the
    // real 'click' on, so the tapped item's own action (Edit/Duplicate/
    // Move/Delete) never runs and the menu just appears to close on its
    // own. Listening on 'click' instead means the item's own onClick
    // (attached further down the same bubble path) always gets to run
    // first, and this handler only ever sees genuinely-outside taps.
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [onClose]);
  return ref;
}

function TabNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <Tabs<Tab>
      value={tab}
      onChange={setTab}
      items={[
        { key: 'assets', label: 'Assets' },
        { key: 'liabilities', label: 'Liabilities' },
        { key: 'networth', label: 'Net worth' },
        { key: 'allocation', label: 'Allocation' },
      ]}
      className="-mx-4 px-4 sm:mx-0 sm:px-0"
    />
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
    <div className="relative w-full min-w-0 sm:flex-1 sm:min-w-[150px]" ref={ref}>
      <span className="text-xs font-medium text-muted mb-1 block">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-9 flex items-center justify-between gap-1.5 border border-line rounded-lg px-3 py-1 bg-surface text-left hover:border-slate-300 transition-colors"
      >
        <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
          {selected.length === 0 ? (
            <span className="text-faint text-sm truncate">{placeholder}</span>
          ) : (
            selected.map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 bg-primary-soft text-primary-ink text-xs font-medium pl-2 pr-1 py-0.5 rounded-md max-w-full truncate"
                >
                  {opt?.label ?? v}
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(v);
                    }}
                    className="hover:bg-brand-100 dark:hover:bg-brand-800/40 rounded-sm p-0.5 shrink-0"
                  >
                    <X size={11} />
                  </span>
                </span>
              );
            })
          )}
        </div>
        <div className="flex items-center gap-1 text-slate-600 shrink-0">
          {selected.length > 0 && (
            <span
              role="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange([]);
              }}
              className="hover:text-slate-600"
            >
              <X size={13} />
            </span>
          )}
          <ChevronDown size={13} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {open && (
        <div className="animate-menu-in absolute z-20 mt-1 w-full bg-surface border border-line rounded-xl shadow-lg max-h-56 overflow-y-auto py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-slate-600">No options yet</p>
          ) : (
            options.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-2.5 px-3 py-2 text-sm text-ink-2 hover:bg-surface-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt.value)}
                  onChange={() => toggleOption(opt.value)}
                  className="h-4 w-4 rounded border-slate-300 accent-brand-600"
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

function SummaryCard({
  label,
  value,
  tone,
  loading,
}: {
  label: string;
  value: string;
  tone: 'brand' | 'red' | 'slate';
  loading?: boolean;
}) {
  return (
    <StatCard
      label={label}
      value={value}
      loading={loading}
      tone={tone === 'red' ? 'negative' : tone === 'brand' ? 'positive' : 'default'}
    />
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
  const previousCloses = useLivePricesStore((s) => s.previousCloses);
  const dayChangeResetActive = useDayChangeResetWindow();
  const marketSessionProgress = useMarketSessionProgress();
  const marketOpen = useIsMarketOpen();
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const sipValuesAttempted = useLivePricesStore((s) => s.sipValuesAttempted);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const goldPriceError = useLivePricesStore((s) => s.goldPriceError);
  const assetsServerConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  // Same reasoning as the Dashboard's Net Worth card: show totals as soon as
  // either (a) a real price fetch has completed this session, or (b) we
  // already have a real cached price for every live-priced holding from
  // last time — no need to make the person wait out a fresh network
  // round-trip just to render a number that'll very likely be unchanged; it
  // shows instantly and the background refresh corrects it silently if not.
  const liveEquityAssets = allAssets.filter((a) => a.symbol && a.quantity && a.quantity > 0);
  const hasLivePriced = liveEquityAssets.length > 0;
  const pricesCached =
    hasLivePriced && liveEquityAssets.every((a) => livePrices[a.symbol!.toUpperCase()] !== undefined);
  const sipLinkedAssets = allAssets.filter(
    (a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol)
  );
  const hasSipLinked = sipLinkedAssets.length > 0;
  const sipCached = hasSipLinked && sipLinkedAssets.every((a) => sipValues[a.symbol!.trim()] !== undefined);
  const liveGoldAssets = allAssets.filter((a) => a.assetClass === 'gold' && a.quantity && a.quantity > 0);
  const hasLiveGold = liveGoldAssets.length > 0;
  // A failed gold-price fetch (goldPriceError) also counts as "attempted" —
  // otherwise a first-ever visit with no cached rate and a network failure
  // would leave totalsReady stuck false forever.
  const goldPriceCached = hasLiveGold && (liveGoldPricePerGram !== null || goldPriceError);
  const totalsReady =
    assetsServerConfirmed &&
    (!hasLivePriced || pricesAttempted || pricesCached) &&
    (!hasSipLinked || sipValuesAttempted || sipCached) &&
    (!hasLiveGold || goldPriceCached);
  // Per-row version of the same readiness check — an asset only needs to
  // wait on totalsReady if it's actually live-priced (a market symbol with
  // quantity, a linked SIP, or a Gold holding with grams tracked, which is
  // priced off the live per-gram rate). Everything else (FDs, cash, etc.)
  // never depends on a price fetch, so it should never sit behind a
  // loading skeleton.
  const isAssetLivePriced = (a: Asset) =>
    (!!a.symbol && !!a.quantity && a.quantity > 0) ||
    (a.assetClass === 'sip' && !!a.symbol && /^\d+$/.test(a.symbol)) ||
    (a.assetClass === 'gold' && !!a.quantity && a.quantity > 0);
  const user = useAuthStore((s) => s.user);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  useModalBackClose(modalOpen, () => setModalOpen(false));
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get('q') ?? '');
  const [sortKey, setSortKey] = useState<SortKey>('manual');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCategories, setSelectedCategories] = useState<string[]>(() =>
    loadPersistedFilter('aurafin.wealth.filter.categories')
  );
  const [selectedTypes, setSelectedTypes] = useState<string[]>(() =>
    loadPersistedFilter('aurafin.wealth.filter.types')
  );
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>(() =>
    loadPersistedFilter('aurafin.wealth.filter.currencies')
  );
  useEffect(() => {
    savePersistedFilter('aurafin.wealth.filter.categories', selectedCategories);
  }, [selectedCategories]);
  useEffect(() => {
    savePersistedFilter('aurafin.wealth.filter.types', selectedTypes);
  }, [selectedTypes]);
  useEffect(() => {
    savePersistedFilter('aurafin.wealth.filter.currencies', selectedCurrencies);
  }, [selectedCurrencies]);
  const [viewingAsset, setViewingAsset] = useState<Asset | null>(null);
  // Viewing an asset swaps the whole tab into a full detail page (like a
  // pushed screen), so the phone/PWA Back button should close it and land
  // back on the list — not skip past it to whatever page was open before
  // Wealth. Same guard-history-entry trick already used for the modals below.
  useModalBackClose(!!viewingAsset, () => setViewingAsset(null));
  // Remembers where the list was scrolled to right before opening a
  // holding, so coming back (via the detail page's Back button or the
  // phone/PWA back gesture) restores that exact spot instead of resetting
  // to the top of a long list.
  const listScrollPosRef = useRef(0);
  const openHolding = (a: Asset) => {
    listScrollPosRef.current = window.scrollY;
    setViewingAsset(a);
  };
  // Opening a holding's detail page should always land at the top of that
  // page, not wherever the list happened to be scrolled to (e.g. after
  // scrolling down to tap a holding near the bottom of a long list).
  // Going back restores the list's previous scroll position instead.
  // useLayoutEffect (not useEffect) so this runs before the browser paints
  // the new content. With useEffect, the list briefly paints at whatever
  // scroll position it happens to re-render at (often the top) and only
  // *then* jumps to the restored position on the next tick — a visible
  // flash-then-jump that looks like the scroll position isn't being kept.
  // Setting it pre-paint lands directly on the right spot with no flash.
  useLayoutEffect(() => {
    if (viewingAsset) {
      window.scrollTo({ top: 0 });
    } else {
      window.scrollTo({ top: listScrollPosRef.current });
    }
  }, [viewingAsset]);
  const [holdingsMenuOpenId, setHoldingsMenuOpenId] = useState<string | null>(null);
  // Whether the currently-open row menu should render above its "..." button
  // instead of below. Rows near the bottom of the screen (e.g. the last
  // holding in the list) don't have enough space below them for the full
  // 5-item menu, so it used to get clipped by the bottom nav / FAB and
  // options like "Move down" / "Delete" were impossible to reach.
  const [holdingsMenuUpward, setHoldingsMenuUpward] = useState(false);
  // Viewport-relative coordinates for the currently-open row menu, captured
  // from the "..." button at the moment it's clicked. The menu itself is
  // rendered through a portal straight onto <body> (see the render below)
  // instead of as a child of the row, positioned with these fixed
  // coordinates — a plain `absolute` child would get clipped by the
  // desktop table's `overflow-x-auto` wrapper (needed for horizontal
  // scrolling on narrow windows), which made the menu render cut off for
  // holdings near the top or bottom of the table instead of showing all 5
  // options.
  const [holdingsMenuAnchor, setHoldingsMenuAnchor] = useState<{
    top: number;
    bottom: number;
    right: number;
  } | null>(null);
  const holdingsMenuRef = useOutsideClose(() => {
    setHoldingsMenuOpenId(null);
    // Reuse the same "swallow the very next row click" pattern already used
    // after a drag-reorder: closing the menu shouldn't also let that same
    // tap fall through and open whatever row happens to be underneath it.
    // Unlike stopping propagation at the document level, this only affects
    // the row's own "open this asset" click — it doesn't block a tap on a
    // *different* row's "..." button, so switching straight from one row's
    // menu to another still works in a single click.
    suppressRowClickRef.current = true;
    setTimeout(() => {
      suppressRowClickRef.current = false;
    }, 0);
  });

  // Decide, at the moment the menu is opened, whether there's enough room
  // below the trigger button to fit the menu — and flip it upward if not.
  const openHoldingsMenu = (id: string, triggerEl: HTMLElement) => {
    setHoldingsMenuOpenId((current) => {
      if (current === id) {
        setHoldingsMenuAnchor(null);
        return null;
      }
      const MENU_HEIGHT_ESTIMATE = 200; // ~5 rows incl. padding
      const rect = triggerEl.getBoundingClientRect();
      const upward = window.innerHeight - rect.bottom < MENU_HEIGHT_ESTIMATE;
      setHoldingsMenuUpward(upward);
      setHoldingsMenuAnchor({
        top: rect.top,
        bottom: rect.bottom,
        right: window.innerWidth - rect.right,
      });
      return id;
    });
  };

  const [confirmDeleteAsset, setConfirmDeleteAsset] = useState<Asset | null>(null);

  // Clicking "Wealth" in the sidebar/bottom nav while already on this page
  // re-navigates to the same route — React Router doesn't unmount/remount
  // AssetsTab for that, so any open overlay here (edit modal, asset detail
  // view, delete confirm, etc.) would otherwise just stay open, making the
  // nav click look like it did nothing. `location.key` changes on every
  // navigation (even to the same URL), so it's a reliable signal that the
  // person just "arrived" here again and any open overlay should close,
  // landing them back on the plain holdings list like a fresh visit would.
  const location = useLocation();
  const isFirstLocationRef = useRef(true);
  useEffect(() => {
    if (isFirstLocationRef.current) {
      isFirstLocationRef.current = false;
      return;
    }
    setModalOpen(false);
    setViewingAsset(null);
    setConfirmDeleteAsset(null);
    setHoldingsMenuOpenId(null);
    setSortSheetOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const handleDelete = async (id: string) => {
    if (!user) {
      alert('You need to be signed in to delete an asset. Please reload the app and try again.');
      return;
    }
    try {
      await removeDoc(user, 'assets', id);
    } catch (err) {
      console.error('Failed to delete asset', err);
      alert('Could not delete this asset. Please check your connection and try again.');
    }
  };

  // Lightweight save used by the SIP Pause/Resume/Buy More quick actions —
  // unlike handleSave (used by the full edit form), this never touches
  // modalOpen/editing state since it's triggered straight from the detail
  // screen, not the edit modal.
  const handleQuickUpdate = async (asset: Asset) => {
    if (!user) {
      alert('You need to be signed in to update this SIP. Please reload the app and try again.');
      return;
    }
    try {
      await upsertDoc(user, 'assets', asset);
    } catch (err) {
      console.error('Failed to update SIP', err);
      alert('Could not save this change. Please check your connection and try again.');
    }
  };

  // Records a Sell / Dividend as a Money > Transactions entry so it shows up
  // in the person's income history, not just as a silent balance bump on
  // the receiving account.
  const handleLogTransaction = async (t: Transaction) => {
    if (!user) return;
    try {
      await upsertDoc(user, 'transactions', t.profileId ? t : { ...t, profileId: activeProfileId ?? undefined });
    } catch (err) {
      console.error('Failed to log transaction', err);
      alert('The holding was updated, but logging the transaction failed. Please check your connection.');
    }
  };

  const handleDuplicate = async (a: Asset) => {
    console.log('[DEBUG] handleDuplicate called for', a.id, a.name, 'user:', user?.uid);
    if (!user) {
      alert('You need to be signed in to duplicate an asset. Please reload the app and try again.');
      return;
    }
    try {
      await upsertDoc(user, 'assets', {
        ...a,
        id: crypto.randomUUID(),
        name: `${a.name} (Copy)`,
        updatedAt: Date.now(),
      });
      console.log('[DEBUG] handleDuplicate finished writing to Firestore');
    } catch (err) {
      console.error('Failed to duplicate asset', err);
      alert('Could not duplicate this asset. Please check your connection and try again.');
    }
  };

  /** Manual reorder from the Holdings table — swaps this asset's position
   *  with its neighbor above/below. Falls back to each asset's current
   *  index as its order the first time it's moved. */
  const handleMove = async (id: string, direction: 'up' | 'down') => {
    if (!user) return;
    setSortKey('manual');
    const ordered = [...assets].sort(
      (a, b) => defaultAssetClassRank(a) - defaultAssetClassRank(b) || (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt
    );
    const idx = ordered.findIndex((a) => a.id === id);
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (idx === -1 || swapIdx < 0 || swapIdx >= ordered.length) return;
    const current = ordered[idx];
    const neighbor = ordered[swapIdx];
    const currentOrder = current.order ?? idx;
    const neighborOrder = neighbor.order ?? swapIdx;
    try {
      await upsertDoc(user, 'assets', { ...current, order: neighborOrder });
      await upsertDoc(user, 'assets', { ...neighbor, order: currentOrder });
    } catch (err) {
      console.error('Failed to reorder assets', err);
    }
  };

  // --- Long-press-to-drag reordering for the Holdings table -------------
  // Press and hold a row for LONG_PRESS_MS without moving more than
  // DRAG_MOVE_CANCEL_PX (so a scroll/tap isn't mistaken for a drag start).
  // Once active, the row follows the pointer between the other rows and,
  // on release, the new order is written back via the same `order` field
  // the Move up/down menu items already use.
  const LONG_PRESS_MS = 350;
  const DRAG_MOVE_CANCEL_PX = 6;
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  const dragRef = useRef<{
    id: string;
    startY: number;
    timer: ReturnType<typeof setTimeout> | null;
    dragging: boolean;
  } | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [manualDragIds, setManualDragIds] = useState<string[] | null>(null);
  const suppressRowClickRef = useRef(false);

  const handleRowPointerDown = (e: ReactPointerEvent<HTMLTableRowElement>, id: string) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const startY = e.clientY;
    const timer = setTimeout(() => {
      if (!dragRef.current || dragRef.current.id !== id) return;
      dragRef.current.dragging = true;
      if (sortKey !== 'manual') setSortKey('manual');
      const orderedIds = [...assets]
        .sort((a, b) => defaultAssetClassRank(a) - defaultAssetClassRank(b) || (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt)
        .map((x) => x.id);
      setManualDragIds(orderedIds);
      setDraggingId(id);
      try {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer capture isn't critical — dragging still works without it */
      }
      navigator.vibrate?.(12);
    }, LONG_PRESS_MS);
    dragRef.current = { id, startY, timer, dragging: false };
  };

  const handleRowPointerMove = (e: ReactPointerEvent<HTMLTableRowElement>, id: string) => {
    const info = dragRef.current;
    if (!info || info.id !== id) return;
    if (!info.dragging) {
      if (Math.abs(e.clientY - info.startY) > DRAG_MOVE_CANCEL_PX && info.timer) {
        clearTimeout(info.timer);
        dragRef.current = null;
      }
      return;
    }
    e.preventDefault();
    setManualDragIds((ids) => {
      if (!ids) return ids;
      const currentIndex = ids.indexOf(id);
      if (currentIndex === -1) return ids;
      let targetIndex = ids.length - 1;
      for (let i = 0; i < ids.length; i++) {
        const el = rowRefs.current[ids[i]];
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (e.clientY < rect.top + rect.height / 2) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex === currentIndex) return ids;
      const next = [...ids];
      next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, id);
      return next;
    });
  };

  const finishDrag = async () => {
    const info = dragRef.current;
    if (info?.timer) clearTimeout(info.timer);
    const wasDragging = info?.dragging;
    dragRef.current = null;
    if (!wasDragging) return;
    suppressRowClickRef.current = true;
    setTimeout(() => {
      suppressRowClickRef.current = false;
    }, 0);
    const ids = manualDragIds;
    setDraggingId(null);
    setManualDragIds(null);
    if (ids && user) {
      for (let i = 0; i < ids.length; i++) {
        const asset = assets.find((x) => x.id === ids[i]);
        if (asset && (asset.order ?? -1) !== i) {
          try {
            await upsertDoc(user, 'assets', { ...asset, order: i });
          } catch (err) {
            console.error('Failed to reorder assets', err);
          }
        }
      }
    }
  };

  const handleRowPointerCancel = () => {
    const info = dragRef.current;
    if (info?.timer) clearTimeout(info.timer);
    dragRef.current = null;
    setDraggingId(null);
    setManualDragIds(null);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  // Compact "Sort  < Current (Invested) > " control above the Holdings
  // table. This is purely a DISPLAY toggle — it switches which figure is
  // shown per row on mobile (mirrors the three data columns of the desktop
  // table: Current/Invested value, Returns, and Market price), but never
  // touches sortKey/sortDir, so the holdings stay in their existing order
  // when you flip it. Actual re-sorting is still done via the clickable
  // column headers below (toggleSort).
  const DISPLAY_METRIC_OPTIONS: { key: 'valueInvested' | 'returns' | 'marketPrice'; label: string }[] = [
    { key: 'valueInvested', label: 'Current (Invested)' },
    { key: 'returns', label: 'Returns (%)' },
    { key: 'marketPrice', label: 'Market price (1D%)' },
  ];
  const [displayMetric, setDisplayMetric] = useState<'valueInvested' | 'returns' | 'marketPrice'>('valueInvested');
  const compactSortIndex = DISPLAY_METRIC_OPTIONS.findIndex((o) => o.key === displayMetric);
  const compactSortLabel = DISPLAY_METRIC_OPTIONS[compactSortIndex].label;
  const cycleCompactSort = (direction: 1 | -1) => {
    const nextIndex = (compactSortIndex + direction + DISPLAY_METRIC_OPTIONS.length) % DISPLAY_METRIC_OPTIONS.length;
    setDisplayMetric(DISPLAY_METRIC_OPTIONS[nextIndex].key);
  };

  // "Sort by" bottom sheet — tapping the "Sort" label opens this instead of
  // re-sorting directly. Choices are staged in draftSortKey/draftSortDir and
  // only committed to the real sortKey/sortDir (which actually reorders the
  // holdings list) when the user taps Apply, mirroring the Kite-style sheet.
  const SORT_BY_OPTIONS: { key: SortKey; label: string }[] = [
    { key: 'value', label: 'Current Value' },
    { key: 'pnl', label: 'Returns %' },
    { key: 'dayChange', label: 'Day Change %' },
    { key: 'name', label: 'Stock name' },
  ];
  const [sortSheetOpen, setSortSheetOpen] = useState(false);
  useBodyScrollLock(sortSheetOpen);
  const [draftSortKey, setDraftSortKey] = useState<SortKey>(sortKey === 'manual' ? 'value' : sortKey);
  const [draftSortDir, setDraftSortDir] = useState<'asc' | 'desc'>(sortDir);
  const openSortSheet = () => {
    setDraftSortKey(sortKey === 'manual' ? 'value' : sortKey);
    setDraftSortDir(sortDir);
    setSortSheetOpen(true);
  };
  const applySortSheet = () => {
    setSortKey(draftSortKey);
    setSortDir(draftSortDir);
    setSortSheetOpen(false);
  };


  const handleSave = async (asset: Asset) => {
    if (!user) return;
    try {
      await upsertDoc(user, 'assets', asset);
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
        const { invested, currentPrice, value, pnl, pnlPercent } = resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram);
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
      // Once a holding has been completely sold out it moves to
      // Investments → Profit & Loss → Sold Investments instead of
      // lingering here as a "0 shares" ghost card — it isn't deleted,
      // just no longer an active position. See utils/investmentPnl.ts.
      if (isFullySold(a)) return false;
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
    .sort((a, b) => defaultAssetClassRank(a) - defaultAssetClassRank(b) || (a.order ?? 0) - (b.order ?? 0) || a.updatedAt - b.updatedAt);

  const totalValue = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value, 0);

  const rows = filtered.map((a) => {
    const computed = resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram);
    const alloc = totalValue > 0 ? (computed.value / totalValue) * 100 : 0;
    // Per-unit 1D change (only meaningful for symbol-priced holdings that
    // have a previous close — e.g. direct stocks; undefined for everything
    // else, which the Holdings table below renders as "—" rather than 0).
    // Between 5:30 AM and market open (9:15 AM) IST, this is pinned to 0
    // instead of showing last night's now-stale change — see
    // useDayChangeResetWindow / isDayChangeResetWindow for why.
    const previousClose = resolvePreviousClose(a.symbol, previousCloses);
    const hasDayChangeData = previousClose !== undefined && computed.currentPrice !== undefined;
    const dayChangePerUnit = hasDayChangeData
      ? dayChangeResetActive
        ? 0
        : computed.currentPrice! - previousClose!
      : undefined;
    const dayChangePercent =
      dayChangePerUnit !== undefined && previousClose
        ? dayChangeResetActive
          ? 0
          : (dayChangePerUnit / previousClose) * 100
        : undefined;
    return { asset: a, ...computed, alloc, previousClose, dayChangePerUnit, dayChangePercent };
  });

  const totalInvested = rows.reduce((s, r) => s + (r.invested ?? r.value), 0);
  const totalCurrentValue = rows.reduce((s, r) => s + r.value, 0);
  const totalPnl = totalCurrentValue - totalInvested;
  const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  // 1D return on the filtered book: sum of each holding's per-unit change ×
  // quantity, expressed as a % of what the book was worth at yesterday's
  // close (not today's) — the standard way brokers compute this, so a
  // holding you bought today at a gain doesn't inflate "how much did my
  // *existing* portfolio move today". Only holdings with a known previous
  // close (i.e. actual live symbol quotes) contribute.
  const rowsWithDayChange = rows.filter((r) => r.dayChangePerUnit !== undefined);
  const has1dData = rowsWithDayChange.length > 0;
  const total1dAbs = rowsWithDayChange.reduce(
    (s, r) => s + r.dayChangePerUnit! * (r.asset.quantity ?? 0),
    0
  );
  const prev1dTotalValue = rowsWithDayChange.reduce(
    (s, r) => s + (r.previousClose ?? 0) * (r.asset.quantity ?? 0),
    0
  );
  const total1dPercent = prev1dTotalValue > 0 ? (total1dAbs / prev1dTotalValue) * 100 : 0;

  // Realized P&L + number of fully-sold positions — the same aggregate the
  // Performance page shows, so the two screens can never disagree.
  const realizedSummary = useMemo(() => {
    const pnl = computePortfolioPnl(assets, 'INR', livePrices, sipValues, liveGoldPricePerGram);
    return { realized: pnl.realizedPnl, sold: pnl.sold.length };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAssets, activeProfileId, livePrices, sipValues, liveGoldPricePerGram]);

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
              case 'dayChange':
                return r.dayChangePercent ?? 0;
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

  // While a long-press drag is in progress, render rows in the live drag
  // order instead of sortedRows, so the row visibly moves as you drag it.
  const displayRows = manualDragIds
    ? (manualDragIds
        .map((id) => sortedRows.find((r) => r.asset.id === id))
        .filter((r): r is (typeof sortedRows)[number] => !!r))
    : sortedRows;

  // TEMP DEBUG — remove once we've confirmed where the chain breaks. Logs
  // every time modalOpen actually changes, and prints a stack trace when it
  // flips back to false so we can see exactly what caused it.
  useEffect(() => {
    console.log('[DEBUG] modalOpen changed to', modalOpen);
    if (modalOpen === false) {
      console.trace('[DEBUG] modalOpen became false — trace');
    }
  }, [modalOpen]);

  const openEdit = (a: Asset) => {
    console.log('[DEBUG] openEdit called for', a.id, a.name);
    setEditing(a);
    setModalOpen(true);
  };

  if (viewingAsset) {
    const live = assets.find((x) => x.id === viewingAsset.id) ?? viewingAsset;
    // "Holding"-style assets (equities/funds/crypto priced per-unit, or
    // weight-tracked metals) get the brokerage-style Holding details
    // screen; everything else (FDs, real estate, cash, etc.) keeps the
    // simpler DETAILS-grid layout, since Mkt price/Avg price/XIRR/
    // Breakdown don't apply to them.
    const isHoldingStyle =
      (SYMBOL_ENABLED_CLASSES.has(live.assetClass) || WEIGHT_TRACKED_CLASSES.has(live.assetClass)) &&
      (live.quantity ?? 0) > 0 &&
      buildHoldingLots(live).length > 0;
    const detailProps = {
      asset: live,
      onBack: () => setViewingAsset(null),
      onEdit: (a: Asset) => {
        setViewingAsset(null);
        openEdit(a);
      },
      onDelete: async (id: string) => {
        await handleDelete(id);
        setViewingAsset(null);
      },
      onQuickUpdate: handleQuickUpdate,
      // Only meaningful for HoldingDetailView's Buy/Sell/Dividend action,
      // but harmless to pass through to AssetDetailPage too since it just
      // won't use them.
      // Cash/bank accounts are household-wide (same accounts everyone in
      // the household can pay into/out of), not scoped to whichever family
      // member profile happens to be active — mirrors the Accounts tab on
      // the Money page, which also lists every cash account regardless of
      // the active profile. Using the profile-filtered `assets` here would
      // hide perfectly good accounts whenever a specific profile is active.
      accounts: allAssets.filter((a) => a.assetClass === 'cash'),
      onLogTransaction: handleLogTransaction,
    };
    return isHoldingStyle ? <HoldingDetailView {...detailProps} /> : <AssetDetailPage {...detailProps} />;
  }

  function SortHeader({
    label,
    sortKeyName,
    align = 'left',
    className,
  }: {
    label: string;
    sortKeyName: SortKey;
    align?: 'left' | 'right';
    className?: string;
  }) {
    const active = sortKey === sortKeyName;
    return (
      <Th
        sortable
        align={align}
        active={active}
        dir={sortDir}
        onSort={() => toggleSort(sortKeyName)}
        className={className}
      >
        {label}
      </Th>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Assets"
        description={`${assets.length} ${assets.length === 1 ? 'asset' : 'assets'} · unlimited`}
        meta={
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live prices update every 60 seconds
          </p>
        }
        actions={
          <>
            <div className="relative flex-1 min-w-[140px] sm:flex-none sm:w-56">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search assets"
                aria-label="Search assets"
                leftIcon={<Search size={16} />}
              />
            </div>
            <Button
              variant="secondary"
              className="hidden md:inline-flex"
              leftIcon={<BarChart2 size={15} />}
              onClick={() => setTab('allocation')}
            >
              Analyse
            </Button>
            <IconButton
              label="Export CSV"
              variant="secondary"
              onClick={handleExport}
              disabled={assets.length === 0}
              className="disabled:opacity-40"
            >
              <Download size={16} />
            </IconButton>
            <Button onClick={onAdd} leftIcon={<Plus size={16} />} className="flex-1 sm:flex-none">
              Add asset
            </Button>
          </>
        }
      />

      <TabNav tab={tab} setTab={setTab} />

      <div className="grid grid-cols-2 sm:flex sm:items-end gap-2.5 sm:gap-3">
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

      {filtered.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Wallet size={18} />}
            title={assets.length === 0 ? 'No assets yet' : 'No assets match your filters'}
            description={
              assets.length === 0
                ? 'Add your first holding to start tracking your portfolio.'
                : 'Try a different search term or clear a filter.'
            }
            action={
              assets.length === 0 ? (
                <Button onClick={onAdd} leftIcon={<Plus size={16} />}>
                  Add asset
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="space-y-3">
          {/* Portfolio KPIs. Realized P&L and the sold count come from the same
              computePortfolioPnl the Performance page uses, so both agree. */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
            <StatCard
              dense
              label="Current value"
              loading={!totalsReady}
              value={maskAmount(totalCurrentValue, 'INR', privacyMode, { fractionDigits: 0 })}
              sublabel={`${rows.length} ${rows.length === 1 ? 'holding' : 'holdings'}`}
              className="col-span-2 lg:col-span-1"
            />
            <StatCard
              dense
              label="Total invested"
              loading={!totalsReady}
              value={maskAmount(totalInvested, 'INR', privacyMode, { fractionDigits: 0 })}
              sublabel="Cost basis"
            />
            <StatCard
              dense
              label="Overall P&L"
              loading={!totalsReady}
              tone={totalPnl >= 0 ? 'positive' : 'negative'}
              value={privacyMode ? '••••••' : formatSignedCurrency(totalPnl, 'INR', 0)}
              delta={!privacyMode ? { value: formatPercentMagnitude(totalPnlPercent), positive: totalPnl >= 0 } : undefined}
              sublabel="Unrealised"
            />
            <StatCard
              dense
              label="1D returns"
              loading={!totalsReady}
              tone={!has1dData ? 'default' : total1dAbs >= 0 ? 'positive' : 'negative'}
              value={!has1dData ? '—' : privacyMode ? '••••••' : formatSignedCurrency(total1dAbs, 'INR', 0)}
              delta={has1dData && !privacyMode ? { value: formatPercentMagnitude(total1dPercent), positive: total1dAbs >= 0 } : undefined}
              sublabel="vs. prev. close"
            />
            <Link to="/wealth/performance" className="group block min-w-0">
              <StatCard
                label="Realized P&L"
                dense
                loading={!totalsReady}
                tone={realizedSummary.realized > 0 ? 'positive' : realizedSummary.realized < 0 ? 'negative' : 'default'}
                value={privacyMode ? '••••••' : formatSignedCurrency(realizedSummary.realized, 'INR', 0)}
                sublabel={
                  <span className="inline-flex items-center gap-1 group-hover:text-primary-ink transition-colors">
                    {realizedSummary.sold} sold · View performance <ArrowUpRight size={12} />
                  </span>
                }
                className="h-full group-hover:border-slate-300 transition-colors"
              />
            </Link>
          </div>

          {/* Compact display toggle — cycles which figure is shown per row
              in the mobile list below (mirrors the three data columns of
              the desktop table). Purely cosmetic — never re-sorts. */}
          <div className="flex items-center justify-between px-1 sm:hidden">
            <button
              type="button"
              onClick={openSortSheet}
              className="inline-flex items-center gap-1 w-fit"
            >
              <span className="text-sm font-semibold text-ink">Sort</span>
              <ListFilter size={15} strokeWidth={2.25} className="text-ink" />
            </button>
            <div
              role="button"
              tabIndex={0}
              onClick={() => cycleCompactSort(1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  cycleCompactSort(1);
                }
              }}
              className="inline-flex items-center gap-1 w-fit cursor-pointer select-none"
            >
              <div className="flex items-center text-ink">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleCompactSort(-1);
                  }}
                  aria-label="Previous display option"
                  className="h-5 w-4 flex items-center justify-center hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
                >
                  <ChevronLeft size={15} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleCompactSort(1);
                  }}
                  aria-label="Next display option"
                  className="h-5 w-4 flex items-center justify-center hover:text-slate-500 dark:hover:text-slate-300 transition-colors"
                >
                  <ChevronRight size={15} strokeWidth={2.5} />
                </button>
              </div>
              <span
                key={compactSortLabel}
                className="text-sm font-semibold text-ink animate-value-in whitespace-nowrap"
              >
                {compactSortLabel}
              </span>
            </div>
          </div>

          {/* Mobile holdings list — shows a single value per row (Current or
              Invested, driven by the Sort control above) instead of the
              wide multi-column table, so nothing gets cut off on small
              screens. The full table below is for sm+ screens where there's
              room for every column. */}
          <div className="sm:hidden bg-surface divide-y divide-line-soft -mx-4">
            {displayRows.map((r) => {
              const a = r.asset;
              const invested = r.invested ?? r.value;
              const qty = a.quantity ?? 0;
              const subtitle =
                a.assetClass === 'stock' && qty > 0
                  ? `${qty} share${qty === 1 ? '' : 's'}`
                  : WEIGHT_TRACKED_CLASSES.has(a.assetClass) && qty > 0
                    ? `${formatGrams(qty)}g`
                    : qty > 0
                      ? `${qty} unit${qty === 1 ? '' : 's'}`
                      : ASSET_CLASS_LABELS[a.assetClass];
              const loading = isAssetLivePriced(a) && !totalsReady;
              return (
                <div
                  key={a.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (suppressRowClickRef.current) return;
                    openHolding(a);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') openHolding(a);
                  }}
                  className="grid grid-cols-[1fr_44px_1fr] items-center gap-1.5 px-4 py-3 active:bg-slate-50 dark:active:bg-slate-800/40 cursor-pointer select-none"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink truncate">{a.name}</p>
                    <p className="text-[11px] text-slate-600 mt-0.5 truncate">{subtitle}</p>
                  </div>
                  {/* Fixed-width center column — with the name and value+menu
                      columns both set to 1fr on either side, this sits at
                      the exact horizontal center of every row regardless of
                      how long the name or value text is. */}
                  <div className="flex items-center justify-center">
                    {marketOpen && r.previousClose !== undefined && r.currentPrice !== undefined && (
                      <Sparkline
                        seed={a.symbol ?? a.id}
                        previousClose={r.previousClose}
                        currentPrice={dayChangeResetActive ? r.previousClose : r.currentPrice}
                        progress={dayChangeResetActive ? 0 : marketSessionProgress}
                        width={44}
                        height={18}
                      />
                    )}
                  </div>
                  <div className="flex items-center justify-end gap-0.5">
                    <div className="text-right shrink-0">
                      {loading ? (
                        <span className="inline-block h-3 w-12 rounded bg-slate-100 dark:bg-slate-800 animate-pulse ml-auto" />
                      ) : displayMetric === 'returns' ? (
                        <>
                          <div className={`text-sm font-semibold animate-value-in ${(r.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {r.pnl !== undefined ? (privacyMode ? '••••••' : formatSignedCurrency(r.pnl, a.currency)) : '—'}
                          </div>
                          <div className={`text-[11px] mt-0.5 ${(r.pnl ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {r.pnlPercent !== undefined && !privacyMode ? formatPercentMagnitude(r.pnlPercent) : ''}
                          </div>
                        </>
                      ) : displayMetric === 'marketPrice' ? (
                        <>
                          <div className="text-sm font-semibold text-ink animate-value-in">
                            {r.currentPrice !== undefined ? maskPreciseAmount(r.currentPrice, a.currency, privacyMode) : '—'}
                          </div>
                          <div className={`text-[11px] mt-0.5 ${(r.dayChangePerUnit ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {r.dayChangePerUnit !== undefined && r.dayChangePercent !== undefined
                              ? privacyMode
                                ? '••••'
                                : `${formatSignedCurrency(r.dayChangePerUnit, a.currency)} (${formatPercentMagnitude(r.dayChangePercent)})`
                              : '—'}
                          </div>
                        </>
                      ) : (
                        <>
                          <div
                            className={`text-sm font-semibold animate-value-in ${
                              (r.pnl ?? r.value - invested) >= 0 ? 'text-emerald-600' : 'text-red-500'
                            }`}
                          >
                            {maskPreciseAmount(r.value, a.currency, privacyMode)}
                          </div>
                          <div className="text-[11px] mt-0.5 text-slate-600">
                            ({maskPreciseAmount(invested, a.currency, privacyMode)})
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openHoldingsMenu(a.id, e.currentTarget);
                        }}
                        className="h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600"
                      >
                        <MoreVertical size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Per-holding table (sm and up). Column headers are clickable and
              sort the rows (click again to flip direction). Rows still
              support press-and-drag manual ordering + click-through. */}
          <Card padding="none" className="hidden sm:block overflow-hidden">
            <TableContainer>
              <Table className="min-w-[1020px]">
                <THead>
                  <tr>
                    <SortHeader label="Name" sortKeyName="name" className="sticky left-0 z-[1] bg-surface-muted" />
                    <SortHeader label="Qty" sortKeyName="qty" align="right" />
                    <SortHeader label="Avg. cost" sortKeyName="avgCost" align="right" />
                    <SortHeader label="Per unit" sortKeyName="perUnit" align="right" />
                    <SortHeader label="Invested" sortKeyName="invested" align="right" />
                    <SortHeader label="Current value" sortKeyName="value" align="right" />
                    <SortHeader label="P&L" sortKeyName="pnl" align="right" />
                    <SortHeader label="Allocation" sortKeyName="alloc" align="right" />
                    <th className="w-10 px-2" aria-hidden="true" />
                  </tr>
                </THead>
                <TBody>
                  {displayRows.map((r) => {
                    const a = r.asset;
                    const invested = r.invested ?? r.value;
                    const qty = a.quantity ?? 0;
                    const qtyLabel =
                      qty > 0
                        ? WEIGHT_TRACKED_CLASSES.has(a.assetClass)
                          ? `${formatGrams(qty)} g`
                          : qty.toLocaleString('en-IN', { maximumFractionDigits: 4 })
                        : '—';
                    const isBeingDragged = draggingId === a.id;
                    const pending = isAssetLivePriced(a) && !totalsReady;
                    const tone = (n: number | undefined) => ((n ?? 0) >= 0 ? 'text-positive' : 'text-negative');
                    const skeleton = <span className="inline-block h-4 w-16 rounded bg-slate-100 dark:bg-slate-800 animate-pulse" />;
                    return (
                      <tr
                        key={a.id}
                        ref={(el) => {
                          rowRefs.current[a.id] = el;
                        }}
                        className={`group border-b border-line-soft last:border-b-0 transition-colors duration-150 hover:bg-surface-hover/70 cursor-pointer select-none ${
                          isBeingDragged
                            ? 'relative z-10 opacity-70 shadow-lg ring-2 ring-brand-400 bg-surface touch-none cursor-grabbing'
                            : ''
                        }`}
                        onClick={() => {
                          if (suppressRowClickRef.current) return;
                          openHolding(a);
                        }}
                        onPointerDown={(e) => handleRowPointerDown(e, a.id)}
                        onPointerMove={(e) => handleRowPointerMove(e, a.id)}
                        onPointerUp={finishDrag}
                        onPointerCancel={handleRowPointerCancel}
                      >
                        <Td className="pr-2 sticky left-0 z-[1] bg-surface group-hover:bg-surface-hover transition-colors duration-150">
                          <div className="relative flex items-center gap-2 min-w-0">
                            <GripVertical
                              size={14}
                              className={`absolute -left-[17px] top-1/2 -translate-y-1/2 text-slate-300 dark:text-slate-600 cursor-grab ${
                                isBeingDragged ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                              }`}
                            />
                            <div className="min-w-0">
                              <p className="font-medium text-ink truncate max-w-[16rem]">{a.name}</p>
                              <p className="text-xs text-muted mt-0.5 truncate max-w-[16rem]">
                                {ASSET_CLASS_LABELS[a.assetClass]}
                                {a.symbol ? ` · ${a.symbol}` : ''}
                              </p>
                            </div>
                          </div>
                        </Td>
                        <Td numeric className="font-normal text-ink-2">
                          {qtyLabel}
                        </Td>
                        <Td numeric className="font-normal text-ink-2">
                          {a.avgCost ? maskPreciseAmount(a.avgCost, a.currency, privacyMode) : '—'}
                        </Td>
                        <Td numeric>
                          {pending ? (
                            skeleton
                          ) : (
                            <div className="flex items-center justify-end gap-3">
                              {marketOpen && r.previousClose !== undefined && r.currentPrice !== undefined && (
                                <span className="hidden xl:block">
                                  <Sparkline
                                    seed={a.symbol ?? a.id}
                                    previousClose={r.previousClose}
                                    currentPrice={dayChangeResetActive ? r.previousClose : r.currentPrice}
                                    progress={dayChangeResetActive ? 0 : marketSessionProgress}
                                  />
                                </span>
                              )}
                              <div>
                                <div className="font-normal text-ink">
                                  {r.currentPrice !== undefined
                                    ? maskPreciseAmount(r.currentPrice, a.currency, privacyMode)
                                    : '—'}
                                </div>
                                {r.dayChangePerUnit !== undefined && r.dayChangePercent !== undefined ? (
                                  <div className={`text-xs mt-0.5 font-normal ${tone(r.dayChangePerUnit)}`}>
                                    {privacyMode
                                      ? '••••'
                                      : `${formatSignedCurrency(r.dayChangePerUnit, a.currency)} (${formatPercentMagnitude(r.dayChangePercent)})`}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </Td>
                        <Td numeric className="font-normal text-ink-2">
                          {maskPreciseAmount(invested, a.currency, privacyMode)}
                        </Td>
                        <Td numeric>
                          {pending ? (
                            skeleton
                          ) : (
                            <span className="font-semibold text-[15px] text-ink">
                              {maskPreciseAmount(r.value, a.currency, privacyMode)}
                            </span>
                          )}
                        </Td>
                        <Td numeric>
                          {pending ? (
                            skeleton
                          ) : r.pnl !== undefined ? (
                            <div className={tone(r.pnl)}>
                              <div className="font-semibold">
                                {privacyMode ? '••••••' : formatSignedCurrency(r.pnl, a.currency)}
                              </div>
                              <div className="text-xs mt-0.5 font-medium">
                                {r.pnlPercent !== undefined && !privacyMode
                                  ? `${r.pnl >= 0 ? '+' : '−'}${formatPercentMagnitude(r.pnlPercent)}`
                                  : ''}
                              </div>
                            </div>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </Td>
                        <Td numeric>
                          {pending ? (
                            skeleton
                          ) : (
                            <div className="flex flex-col items-end gap-1.5">
                              <span className="font-normal text-ink-2">{r.alloc.toFixed(1)}%</span>
                              <span className="block h-1 w-16 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                <span
                                  className="block h-full rounded-full bg-brand-500"
                                  style={{ width: `${Math.min(100, Math.max(0, r.alloc))}%` }}
                                />
                              </span>
                            </div>
                          )}
                        </Td>
                        <td className="px-2 py-3 relative">
                          <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                            <IconButton
                              label="Row actions"
                              onClick={(e) => {
                                e.stopPropagation();
                                openHoldingsMenu(a.id, e.currentTarget);
                              }}
                            >
                              <MoreVertical size={16} />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </TBody>
                {totalsReady && (
                  <tfoot>
                    <tr className="border-t border-line bg-surface-muted">
                      <Td className="font-semibold sticky left-0 z-[1] bg-surface-muted">Total</Td>
                      <Td />
                      <Td />
                      <Td />
                      <Td numeric className="font-semibold">
                        {maskAmount(totalInvested, 'INR', privacyMode, { fractionDigits: 0 })}
                      </Td>
                      <Td numeric className="font-semibold">
                        {maskAmount(totalCurrentValue, 'INR', privacyMode, { fractionDigits: 0 })}
                      </Td>
                      <Td numeric className={`font-semibold ${totalPnl >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {privacyMode ? '••••••' : formatSignedCurrency(totalPnl, 'INR', 0)}
                      </Td>
                      <Td />
                      <Td />
                    </tr>
                  </tfoot>
                )}
              </Table>
            </TableContainer>
          </Card>
        </div>
      )}

      {/* The open row menu (Edit/Duplicate/Move/Delete), portaled straight
          onto <body> and positioned with fixed viewport coordinates
          captured in openHoldingsMenu. A plain absolutely-positioned child
          of the row would get clipped by the desktop table's
          `overflow-x-auto` wrapper — necessary for horizontal scrolling on
          narrow windows — which cut the menu off (only "Move down"/
          "Delete" visible) for holdings near the top or bottom of the
          table. Portaling escapes that clipping entirely. */}
      {holdingsMenuOpenId && holdingsMenuAnchor && (() => {
        const menuRowIdx = displayRows.findIndex((r) => r.asset.id === holdingsMenuOpenId);
        if (menuRowIdx === -1) return null;
        const menuAsset = displayRows[menuRowIdx].asset;
        const closeMenu = () => {
          setHoldingsMenuOpenId(null);
          setHoldingsMenuAnchor(null);
        };
        return createPortal(
          <div
            ref={holdingsMenuRef}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              right: holdingsMenuAnchor.right,
              ...(holdingsMenuUpward
                ? { bottom: window.innerHeight - holdingsMenuAnchor.top + 4 }
                : { top: holdingsMenuAnchor.bottom + 4 }),
            }}
            className="z-[70] w-40 bg-white dark:bg-slate-800 border border-line rounded-lg shadow-lg py-1"
          >
            <button
              onClick={() => {
                closeMenu();
                openEdit(menuAsset);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Pencil size={14} /> Edit
            </button>
            <button
              onClick={() => {
                closeMenu();
                handleDuplicate(menuAsset);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              <Copy size={14} /> Duplicate
            </button>
            <button
              onClick={() => {
                closeMenu();
                handleMove(menuAsset.id, 'up');
              }}
              disabled={menuRowIdx === 0}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronUp size={14} /> Move up
            </button>
            <button
              onClick={() => {
                closeMenu();
                handleMove(menuAsset.id, 'down');
              }}
              disabled={menuRowIdx === displayRows.length - 1}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <ChevronDown size={14} /> Move down
            </button>
            <button
              onClick={() => {
                closeMenu();
                setConfirmDeleteAsset(menuAsset);
              }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>,
          document.body
        );
      })()}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Asset" contentPanel hideHeader>
        {editing && <AssetDetailsForm initial={editing} onSave={handleSave} onClose={() => setModalOpen(false)} />}
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
            className="flex-1 border border-line text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={async () => {
              if (confirmDeleteAsset) await handleDelete(confirmDeleteAsset.id);
              setConfirmDeleteAsset(null);
            }}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </Modal>

      {sortSheetOpen && (
        <div
          className="animate-backdrop-in fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:justify-center"
          onClick={() => setSortSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="animate-sheet-in w-full sm:max-w-sm bg-surface rounded-t-2xl sm:rounded-2xl sm:mb-6 sm:shadow-2xl pb-[env(safe-area-inset-bottom)] max-h-[85vh] sm:max-h-[75vh] overflow-y-auto"
          >
            <div className="px-5 pt-5 pb-1">
              <h3 className="text-lg font-bold text-ink">Sort by</h3>
            </div>
            <div className="px-5 pb-2">
              {SORT_BY_OPTIONS.map((opt, idx) => {
                const selected = draftSortKey === opt.key;
                const isName = opt.key === 'name';
                return (
                  <div
                    key={opt.key}
                    className={idx > 0 ? 'border-t border-line-soft pt-3 mt-3' : 'pt-1'}
                  >
                    <button
                      type="button"
                      onClick={() => setDraftSortKey(opt.key)}
                      className="w-full flex items-center gap-3 py-1"
                    >
                      <span
                        className={`shrink-0 h-5 w-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                          selected
                            ? 'border-emerald-500'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {selected && <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />}
                      </span>
                      <span className="text-[15px] text-ink">{opt.label}</span>
                    </button>
                    {selected && (
                      <div className="flex items-center gap-2.5 pl-8 pt-3">
                        <button
                          type="button"
                          onClick={() => setDraftSortDir('desc')}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            draftSortDir === 'desc'
                              ? 'border-slate-800 text-slate-900 dark:border-white dark:text-white'
                              : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          <ArrowDown size={14} />
                          {isName ? 'Z to A' : 'High to low'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDraftSortDir('asc')}
                          className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            draftSortDir === 'asc'
                              ? 'border-slate-800 text-slate-900 dark:border-white dark:text-white'
                              : 'border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400'
                          }`}
                        >
                          <ArrowUp size={14} />
                          {isName ? 'A to Z' : 'Low to high'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 pt-4 pb-5">
              <button
                type="button"
                onClick={applySortSheet}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Full-page asset detail view shown when a row is tapped in the mobile list.
 * Note: ISIN / sector / geography aren't in the current `Asset` type, so they're
 * read defensively via an `any` cast and only rendered when present — extend the
 * schema with those fields to have them show up here for real.
 */
/** One row of the "Holding details" breakdown / order history — unifies
 *  the two different lot shapes the schema keeps (unit-tracked shareLots
 *  vs weight-tracked purchaseLots) into a single qty/price/amount/date
 *  shape, and synthesizes a single lot from the legacy quantity+avgCost
 *  fields for older assets saved before per-lot tracking existed. */
interface HoldingLot {
  id: string;
  date?: string;
  qty: number;
  price: number;
  amount: number;
}

function buildHoldingLots(asset: Asset): HoldingLot[] {
  if (asset.shareLots && asset.shareLots.length > 0) {
    return asset.shareLots
      .filter((l) => l.quantity > 0)
      .map((l) => ({ id: l.id, date: l.date, qty: l.quantity, price: l.price, amount: l.quantity * l.price }));
  }
  if (asset.purchaseLots && asset.purchaseLots.length > 0) {
    return asset.purchaseLots
      .filter((l) => l.grams > 0)
      .map((l) => ({ id: l.id, date: l.date, qty: l.grams, price: l.amount / l.grams, amount: l.amount }));
  }
  if (asset.quantity && asset.quantity > 0 && (asset.avgCost || asset.investedValue)) {
    const price = asset.avgCost ?? asset.investedValue! / asset.quantity;
    return [
      {
        id: asset.id,
        date: asset.startDate,
        qty: asset.quantity,
        price,
        amount: asset.investedValue ?? asset.quantity * price,
      },
    ];
  }
  return [];
}

/**
 * Annualized return (XIRR) for a single holding, using every dated lot as
 * an outflow and today's Current Value as the final inflow. Same
 * Newton-Raphson solver as the standalone XIRR calculator (see
 * Calculators.tsx's xirrRate) — duplicated locally rather than shared
 * since the cashflow shape here (derived from lots) is specific to this
 * page. Returns null when there isn't enough dated history to solve for
 * a rate (e.g. a legacy asset with no purchase date at all).
 */
function computeHoldingXirr(lots: HoldingLot[], currentValue: number): number | null {
  const outflows = lots
    .filter((l): l is HoldingLot & { date: string } => !!l.date && l.amount > 0)
    .map((l) => ({ date: new Date(l.date), amount: -l.amount }));
  if (outflows.length === 0) return null;

  const cashflows = [...outflows, { date: new Date(), amount: currentValue }].sort(
    (a, b) => a.date.getTime() - b.date.getTime()
  );
  if (cashflows[0].date.getTime() === cashflows[cashflows.length - 1].date.getTime()) return null;

  const t0 = cashflows[0].date.getTime();
  const years = cashflows.map((c) => (c.date.getTime() - t0) / (365 * 24 * 3600 * 1000));
  const npv = (rate: number) =>
    cashflows.reduce((sum, c, i) => sum + c.amount / Math.pow(1 + rate, years[i]), 0);
  const dnpv = (rate: number) =>
    cashflows.reduce((sum, c, i) => sum - (years[i] * c.amount) / Math.pow(1 + rate, years[i] + 1), 0);

  let rate = 0.1;
  for (let i = 0; i < 100; i++) {
    const f = npv(rate);
    const df = dnpv(rate);
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (!Number.isFinite(next)) break;
    if (Math.abs(next - rate) < 1e-7) {
      rate = next;
      break;
    }
    rate = next;
  }
  return Number.isFinite(rate) ? rate * 100 : null;
}

/** Pause/Resume + Buy More action bar shown on a Mutual Fund SIP's detail
 *  screen (assetClass 'sip' only). Pausing stops future installments from
 *  being counted (see computeSipProgress/listSipInstallments) until
 *  resumed; Buy More either logs a one-time top-up investment or steps the
 *  regular installment amount up (or down) from a chosen date. Both
 *  persist straight through `onUpdate` — no need to open the full edit
 *  form for either action. */
function SipQuickActions({
  asset,
  onUpdate,
}: {
  asset: Asset;
  onUpdate: (a: Asset) => void | Promise<void>;
}) {
  const [buyMoreOpen, setBuyMoreOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const isPaused = !!asset.sipPausedAt;

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap bg-surface rounded-2xl border border-line p-4">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-500'}`} />
          <span className="text-sm font-medium text-ink-2">
            {isPaused ? `Paused since ${asset.sipPausedAt}` : 'SIP active'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPauseModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-line text-ink-2 hover:bg-surface-hover"
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            {isPaused ? 'Resume SIP' : 'Pause SIP'}
          </button>
          <button
            type="button"
            onClick={() => setBuyMoreOpen(true)}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors bg-brand-600 hover:bg-brand-700 text-white"
          >
            <PlusCircle size={14} />
            Buy More
          </button>
        </div>
      </div>

      <SipPauseModal open={pauseModalOpen} asset={asset} onClose={() => setPauseModalOpen(false)} onUpdate={onUpdate} />
      <SipBuyMoreModal open={buyMoreOpen} asset={asset} onClose={() => setBuyMoreOpen(false)} onUpdate={onUpdate} />
    </>
  );
}

/** Pause/Resume for a Mutual Fund SIP, with a date the person can backdate —
 *  e.g. "I skipped August, it's September now" isn't "pause as of today",
 *  it's "paused from 1 Aug". Missed months already in the past just need
 *  the pause date set correctly; nothing is counted for any month from
 *  that date up to today (or up to the resume date, once resumed). */
function SipPauseModal({
  open,
  asset,
  onClose,
  onUpdate,
}: {
  open: boolean;
  asset: Asset;
  onClose: () => void;
  onUpdate: (a: Asset) => void | Promise<void>;
}) {
  const isPaused = !!asset.sipPausedAt;
  const todayIso = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(todayIso);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setDate(todayIso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isPaused]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const confirm = async () => {
    if (!date) return;
    setSaving(true);
    try {
      if (isPaused) {
        // Resume: close the currently-open pause out into history, using
        // whatever resume date was picked (can be backdated too).
        const history = [...(asset.sipPauseHistory ?? [])];
        if (asset.sipPausedAt) history.push({ pausedAt: asset.sipPausedAt, resumedAt: date });
        await onUpdate({ ...asset, sipPausedAt: undefined, sipPauseHistory: history, updatedAt: Date.now() });
      } else {
        await onUpdate({ ...asset, sipPausedAt: date, updatedAt: Date.now() });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title={isPaused ? 'Resume SIP' : 'Pause SIP'}>
      <div className="space-y-4">
        <p className="text-sm text-muted">
          {isPaused
            ? "Pick the date you started investing again — installments before this date stay skipped, and regular installments resume counting from here."
            : "Pick the date this SIP stopped getting debited — you can backdate this to a month you already missed, e.g. the 1st of last month. No installments are counted from this date onward until you resume."}
        </p>
        <div>
          <label className="text-xs font-medium text-muted">
            {isPaused ? 'Resumed from' : 'Paused from'}
          </label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            max={todayIso}
            min={isPaused ? asset.sipPausedAt : asset.startDate}
            className="mt-1 w-full border border-line bg-transparent rounded-lg px-3 py-2.5 text-sm"
            autoFocus
          />
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !date}
            onClick={confirm}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : isPaused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** "Buy More" flow for a Mutual Fund SIP — lets the person either record a
 *  one-time top-up investment (priced, like a regular installment, at the
 *  NAV in effect on the date they pick) or step the regular installment
 *  amount up/down from a chosen date onward, without opening the full
 *  edit form for either. */
function SipBuyMoreModal({
  open,
  asset,
  onClose,
  onUpdate,
}: {
  open: boolean;
  asset: Asset;
  onClose: () => void;
  onUpdate: (a: Asset) => void | Promise<void>;
}) {
  const [mode, setMode] = useState<'choose' | 'topup' | 'increase'>('choose');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMode('choose');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open]);

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submitTopUp = async () => {
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    setSaving(true);
    try {
      const topUps = [...(asset.sipTopUps ?? []), { id: crypto.randomUUID(), date, amount: amt }];
      await onUpdate({ ...asset, sipTopUps: topUps, updatedAt: Date.now() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const submitIncrease = async () => {
    const newAmount = Number(amount);
    if (!newAmount || newAmount <= 0 || !asset.sipAmount) return;
    setSaving(true);
    try {
      const schedule = [...(asset.sipAmountSchedule ?? [])];
      if (schedule.length === 0) {
        schedule.push({ amount: asset.sipAmount, effectiveFrom: asset.startDate ?? date });
      }
      schedule.push({ amount: newAmount, effectiveFrom: date });
      await onUpdate({ ...asset, sipAmount: newAmount, sipAmountSchedule: schedule, updatedAt: Date.now() });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={close} title="Buy more">
      {mode === 'choose' && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setMode('topup')}
            className="w-full text-left p-4 rounded-xl border border-line hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
          >
            <p className="font-semibold text-ink">One-time top-up</p>
            <p className="text-sm text-muted mt-0.5">
              Invest an extra lumpsum now, on top of your regular installment.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setMode('increase')}
            className="w-full text-left p-4 rounded-xl border border-line hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-900/20"
          >
            <p className="font-semibold text-ink">Increase installment</p>
            <p className="text-sm text-muted mt-0.5">
              Step up (or down) the regular {asset.sipFrequency === 'quarterly' ? 'quarterly' : 'monthly'} amount
              from a chosen date onward.
            </p>
          </button>
        </div>
      )}

      {mode === 'topup' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">Top-up amount</label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="e.g. 10000"
              className="mt-1 w-full border border-line bg-transparent rounded-lg px-3 py-2.5 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-line bg-transparent rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving || !amount || Number(amount) <= 0}
              onClick={submitTopUp}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Invest'}
            </button>
          </div>
        </div>
      )}

      {mode === 'increase' && (
        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-muted">
              New {asset.sipFrequency === 'quarterly' ? 'quarterly' : 'monthly'} amount
            </label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={asset.sipAmount ? `Currently ${asset.sipAmount}` : 'e.g. 5000'}
              className="mt-1 w-full border border-line bg-transparent rounded-lg px-3 py-2.5 text-sm"
              autoFocus
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted">Effective from</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="mt-1 w-full border border-line bg-transparent rounded-lg px-3 py-2.5 text-sm"
            />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMode('choose')}
              className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              type="button"
              disabled={saving || !amount || Number(amount) <= 0}
              onClick={submitIncrease}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Update'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Broker-app-style "Holding details" screen — mirrors the layout of a
 *  Kite/Groww holding page (Current/Invested, Unrealised/1D returns, Mkt
 *  price/Avg price/Qty, XIRR, per-lot breakdown, order history, and a
 *  SIP/Sell/Buy action bar) for assets that behave like a tradable
 *  holding (quantity + a per-unit price). Everything else (FDs, real
 *  estate, cash, etc.) keeps the simpler DETAILS-grid layout below. */
function HoldingDetailView({
  asset,
  onBack,
  onEdit,
  onDelete,
  onQuickUpdate,
  accounts,
  onLogTransaction,
}: {
  asset: Asset;
  onBack: () => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
  onQuickUpdate: (a: Asset) => void | Promise<void>;
  /** Bank/cash/wallet accounts (assetClass 'cash') a Sell or Dividend can be credited into. */
  accounts: Asset[];
  onLogTransaction: (t: Transaction) => void | Promise<void>;
}) {
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const previousCloses = useLivePricesStore((s) => s.previousCloses);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const dayChangeResetActive = useDayChangeResetWindow();
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // "+" menu (Buy / Sell / Dividend) shown in the header, before the Edit
  // button. `txMode` drives which form the modal below shows; the menu
  // itself just picks it and closes.
  const [txMenuOpen, setTxMenuOpen] = useState(false);
  const [txMode, setTxMode] = useState<'buy' | 'sell' | 'dividend' | null>(null);
  const txMenuRef = useOutsideClose(() => setTxMenuOpen(false));
  const BREAKDOWN_MODES: { key: 'avg' | 'current' | 'returns'; label: string }[] = [
    { key: 'avg', label: 'Avg price (Invested)' },
    { key: 'current', label: 'Current price (Current value)' },
    { key: 'returns', label: 'Returns (Age)' },
  ];
  const [breakdownModeIdx, setBreakdownModeIdx] = useState(0);
  const cycleBreakdownMode = (dir: 1 | -1) =>
    setBreakdownModeIdx((i) => (i + dir + BREAKDOWN_MODES.length) % BREAKDOWN_MODES.length);
  const breakdownMode = BREAKDOWN_MODES[breakdownModeIdx].key;

  const { invested, value, pnl, currentPrice } = resolveAssetValues(
    asset,
    livePrices,
    sipValues,
    liveGoldPricePerGram
  );
  const positive = (pnl ?? 0) >= 0;
  const category = ASSET_CLASS_TO_CATEGORY[asset.assetClass];
  const qty = asset.quantity ?? 0;

  const previousClose = resolvePreviousClose(asset.symbol, previousCloses);
  const hasDayChangeData = previousClose !== undefined && currentPrice !== undefined;
  const dayChangePerUnit = hasDayChangeData
    ? dayChangeResetActive
      ? 0
      : currentPrice! - previousClose!
    : undefined;
  const dayChangePercent =
    dayChangePerUnit !== undefined && previousClose
      ? dayChangeResetActive
        ? 0
        : (dayChangePerUnit / previousClose) * 100
      : undefined;
  const dayChangeTotal = dayChangePerUnit !== undefined ? dayChangePerUnit * qty : undefined;

  const lots = buildHoldingLots(asset);
  const xirr = computeHoldingXirr(lots, value);

  const orderedLots = [...lots].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-muted shrink-0">
          <ArrowLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-ink flex-1">Holding details</h2>
        <div className="relative shrink-0" ref={txMenuOpen ? txMenuRef : undefined}>
          <button
            onClick={() => setTxMenuOpen((v) => !v)}
            title="Buy / Sell / Dividend"
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-brand-600 hover:bg-brand-700 text-white shadow-xs transition-colors"
          >
            <Plus size={16} />
          </button>
          {txMenuOpen && (
            <div className="absolute right-0 top-11 z-[60] w-44 bg-white dark:bg-slate-800 border border-line rounded-lg shadow-lg py-1">
              <button
                onClick={() => {
                  setTxMenuOpen(false);
                  setTxMode('buy');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <TrendingUp size={14} className="text-emerald-600" /> Buy
              </button>
              <button
                onClick={() => {
                  setTxMenuOpen(false);
                  setTxMode('sell');
                }}
                disabled={(asset.quantity ?? 0) <= 0}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <TrendingDown size={14} className="text-red-500" /> Sell
              </button>
              <button
                onClick={() => {
                  setTxMenuOpen(false);
                  setTxMode('dividend');
                }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700"
              >
                <Banknote size={14} className="text-brand-600" /> Dividend
              </button>
            </div>
          )}
        </div>
        <button
          onClick={() => onEdit(asset)}
          title="Edit"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-line hover:bg-surface-hover text-slate-600 dark:text-slate-300 shrink-0"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          title="Delete"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 shrink-0"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <BuySellDividendModal
        mode={txMode}
        asset={asset}
        accounts={accounts}
        onClose={() => setTxMode(null)}
        onQuickUpdate={onQuickUpdate}
        onLogTransaction={onLogTransaction}
      />

      <Modal open={confirmDeleteOpen} onClose={() => setConfirmDeleteOpen(false)} title="Delete this holding?">
        <p className="text-sm text-muted mb-6">
          This will permanently delete <strong>{asset.name}</strong>. This can't be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setConfirmDeleteOpen(false)}
            className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirmDeleteOpen(false);
              onDelete(asset.id);
            }}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </Modal>

      {/* Symbol row — name + last price/day-change, styled after a
          brokerage app's holding header. */}
      <div className="flex items-center gap-3 px-1">
        <div className="min-w-0 flex-1">
          <p className="text-lg sm:text-xl font-semibold text-ink truncate">
            {asset.symbol || asset.name}
          </p>
          <p className="text-sm mt-0.5">
            {currentPrice !== undefined && (
              <span className="text-slate-600">{formatPreciseCurrency(currentPrice, asset.currency)}</span>
            )}
            {dayChangePerUnit !== undefined && dayChangePercent !== undefined && (
              <span className={`ml-1.5 font-medium ${dayChangePerUnit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatSignedCurrency(dayChangePerUnit, asset.currency)} ({formatPercentMagnitude(dayChangePercent)})
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-slate-600">Current</p>
            <p className="text-2xl sm:text-3xl font-bold text-ink mt-0.5">
              {maskPreciseAmount(value, asset.currency, privacyMode)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-600">Invested</p>
            <p className="text-lg font-normal text-ink -mt-0.5">
              {maskPreciseAmount(invested ?? value, asset.currency, privacyMode)}
            </p>
          </div>
        </div>

        <div className="border-t border-dashed border-line my-4" />

        <div className="space-y-3">
          {pnl !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Unrealised returns</span>
              <span className={`font-semibold ${positive ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatSignedCurrency(pnl, asset.currency)}
                {invested ? ` (${formatPercentMagnitude((pnl / invested) * 100)})` : ''}
              </span>
            </div>
          )}
          {/* Daily interest breakdown for deposit-like assets */}
          {DEPOSIT_LIKE_CLASSES.has(asset.assetClass) && asset.startDate && pnl !== undefined && pnl > 0 && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Days elapsed</span>
                <span className="font-semibold text-ink">
                  {Math.floor((Date.now() - new Date(asset.startDate).getTime()) / (24 * 60 * 60 * 1000))} days
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Daily interest (avg)</span>
                <span className="font-semibold text-emerald-600">
                  {formatSignedCurrency(
                    pnl / Math.max(1, Math.floor((Date.now() - new Date(asset.startDate).getTime()) / (24 * 60 * 60 * 1000))),
                    asset.currency
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">Total interest earned</span>
                <span className="font-semibold text-emerald-600">{formatSignedCurrency(pnl, asset.currency)}</span>
              </div>
            </>
          )}
          {dayChangeTotal !== undefined && dayChangePercent !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">1D returns</span>
              <span className={`font-semibold ${dayChangeTotal >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {formatSignedCurrency(dayChangeTotal, asset.currency)} ({formatPercentMagnitude(dayChangePercent)})
              </span>
            </div>
          )}
        </div>

        <div className="space-y-3 mt-5">
          {currentPrice !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Mkt price</span>
              <span className="font-semibold text-ink">
                {formatPreciseCurrency(currentPrice, asset.currency)}
              </span>
            </div>
          )}
          {asset.avgCost !== undefined && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Avg price</span>
              <span className="font-semibold text-ink">
                {formatPreciseCurrency(asset.avgCost, asset.currency)}
              </span>
            </div>
          )}
          {qty > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Total qty</span>
              <span className="font-semibold text-ink">
                {WEIGHT_TRACKED_CLASSES.has(asset.assetClass) ? `${formatGrams(qty)} g` : qty}
              </span>
            </div>
          )}
        </div>

        {xirr !== null && (
          <>
            <div className="space-y-3 mt-5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300 flex items-center gap-1">
                  XIRR <Info size={12} className="text-slate-300" />
                </span>
                <span className="font-semibold text-ink">{xirr.toFixed(2)}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      {asset.assetClass === 'sip' && <SipQuickActions asset={asset} onUpdate={onQuickUpdate} />}

      {orderedLots.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-ink">Breakdown</h3>
            <div
              role="button"
              tabIndex={0}
              onClick={() => cycleBreakdownMode(1)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') cycleBreakdownMode(1);
              }}
              className="inline-flex items-center gap-1 w-fit cursor-pointer select-none"
            >
              <div className="flex items-center text-muted">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleBreakdownMode(-1);
                  }}
                  aria-label="Previous breakdown mode"
                  className="h-5 w-4 flex items-center justify-center hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronLeft size={15} strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cycleBreakdownMode(1);
                  }}
                  aria-label="Next breakdown mode"
                  className="h-5 w-4 flex items-center justify-center hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <ChevronRight size={15} strokeWidth={2.5} />
                </button>
              </div>
              <span
                key={breakdownMode}
                className="text-xs font-semibold text-slate-600 dark:text-slate-300 underline underline-offset-2 animate-value-in whitespace-nowrap"
              >
                {BREAKDOWN_MODES[breakdownModeIdx].label}
              </span>
            </div>
          </div>
          <div className="divide-y divide-line-soft">
            {orderedLots.map((lot, i) => {
              const isWeight = WEIGHT_TRACKED_CLASSES.has(asset.assetClass);
              const qtyLabel = isWeight ? `${formatGrams(lot.qty)}g` : `${lot.qty} qty`;

              if (breakdownMode === 'returns') {
                const lotCurrentPrice = currentPrice ?? lot.price;
                const lotPnl = (lotCurrentPrice - lot.price) * lot.qty;
                const lotPnlPercent = lot.price > 0 ? ((lotCurrentPrice - lot.price) / lot.price) * 100 : 0;
                const lotPositive = lotPnl >= 0;
                const ageDays = lot.date
                  ? Math.max(0, Math.floor((Date.now() - new Date(lot.date).getTime()) / (24 * 3600 * 1000)))
                  : undefined;
                return (
                  <div key={lot.id + i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-semibold text-ink">{qtyLabel}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{lot.date ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${lotPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                        {formatSignedCurrency(lotPnl, asset.currency)} ({formatPercentMagnitude(lotPnlPercent)})
                      </p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {ageDays !== undefined ? `${ageDays} day${ageDays === 1 ? '' : 's'}` : '—'}
                      </p>
                    </div>
                  </div>
                );
              }

              const displayPrice = breakdownMode === 'avg' ? lot.price : (currentPrice ?? lot.price);
              const displayAmount = breakdownMode === 'avg' ? lot.amount : lot.qty * (currentPrice ?? lot.price);
              return (
                <div key={lot.id + i} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div>
                    <p className="text-sm font-semibold text-ink">{qtyLabel}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{lot.date ?? '—'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-ink">
                      {formatPreciseCurrency(displayPrice, asset.currency)}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5">
                      ({formatPreciseCurrency(displayAmount, asset.currency)})
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 text-center px-4">
        {category?.label ?? ASSET_CLASS_LABELS[asset.assetClass]}
      </p>
    </div>
  );
}

/**
 * Buy / Sell / Dividend action for a Holding-style asset (equities, funds,
 * crypto with shareLots, or weight-tracked metals with purchaseLots).
 *
 * - Buy adds a new lot and recomputes quantity/avg cost/invested value from
 *   all lots — same math the full Edit form uses when lots change.
 * - Sell removes/reduces lots FIFO (oldest first) by the quantity sold,
 *   recomputes the holding's totals the same way, and credits the sale
 *   proceeds (qty × sell price) to whichever bank/cash/wallet account the
 *   person picks — those accounts are just assets with assetClass 'cash',
 *   so crediting them is a normal balance (`value`) update.
 * - Dividend doesn't touch the holding's quantity or cost basis at all —
 *   it just credits the chosen account with the dividend amount.
 * Both Sell and Dividend also log a Money > Transactions "income" entry so
 * there's a record of where the credited amount came from.
 */
function BuySellDividendModal({
  mode,
  asset,
  accounts,
  onClose,
  onQuickUpdate,
  onLogTransaction,
}: {
  mode: 'buy' | 'sell' | 'dividend' | null;
  asset: Asset;
  accounts: Asset[];
  onClose: () => void;
  onQuickUpdate: (a: Asset) => void | Promise<void>;
  onLogTransaction: (t: Transaction) => void | Promise<void>;
}) {
  const open = mode !== null;
  useModalBackClose(open, onClose);

  const isWeightTracked = WEIGHT_TRACKED_CLASSES.has(asset.assetClass);
  const unitLabel = isWeightTracked ? 'grams' : 'units';
  const currentQty = asset.quantity ?? 0;

  const [qty, setQty] = useState('');
  const [price, setPrice] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  // '' = "No cash account (position only)" — crediting proceeds/dividends to
  // a bank account is opt-in, since some people track buys/sells purely at
  // the holding level and don't want every sale to nudge a cash balance.
  const [accountId, setAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Inline "+ New account" mini-form, opened from the "Credited to" dropdown
  // so someone can add a bank/cash/wallet account without leaving this modal.
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<Exclude<AccountType, 'credit_card'>>('bank');
  const [newAccountBalance, setNewAccountBalance] = useState('');
  const [newAccountError, setNewAccountError] = useState('');
  const [creatingAccount, setCreatingAccount] = useState(false);

  // Fresh form every time a new mode is picked from the + menu.
  useEffect(() => {
    if (open) {
      setQty('');
      setPrice('');
      setAmount('');
      setDate(new Date().toISOString().slice(0, 10));
      setAccountId('');
      setError('');
      setNewAccountOpen(false);
      setNewAccountName('');
      setNewAccountType('bank');
      setNewAccountBalance('');
      setNewAccountError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode]);

  const handleCreateAccount = async () => {
    if (!newAccountName.trim()) {
      setNewAccountError('Give the account a name.');
      return;
    }
    setCreatingAccount(true);
    setNewAccountError('');
    try {
      const newAccount: Asset = {
        id: crypto.randomUUID(),
        name: newAccountName.trim(),
        assetClass: 'cash',
        value: Number(newAccountBalance) || 0,
        currency: asset.currency,
        accountType: newAccountType,
        updatedAt: Date.now(),
        // Cash accounts are household-wide (not tied to one family member's
        // profile) — same as accounts created from Money → Accounts — so
        // they keep showing up here no matter which profile is active.
      };
      await onQuickUpdate(newAccount);
      setAccountId(newAccount.id);
      setNewAccountOpen(false);
    } catch (err) {
      console.error('Failed to create account', err);
      setNewAccountError('Could not create this account. Please check your connection and try again.');
    } finally {
      setCreatingAccount(false);
    }
  };

  const close = () => {
    if (saving) return;
    onClose();
  };

  const submitBuy = async () => {
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    if (!qtyNum || qtyNum <= 0 || !priceNum || priceNum <= 0) {
      setError('Enter a valid quantity and price.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Quantity/avg cost/invested value always reflect what's REMAINING
      // after every buy AND sell ever recorded (moving weighted-average —
      // see utils/investmentPnl.ts), not just the sum of buy lots, so a
      // purchase made after a previous partial sell doesn't silently
      // resurrect quantity that was already sold.
      if (isWeightTracked) {
        const newLot = { id: crypto.randomUUID(), date, grams: qtyNum, amount: qtyNum * priceNum };
        const lots = [...(asset.purchaseLots ?? []), newLot];
        const { remainingQty, avgBuyCost, investedValue } = computeHoldingPnl(
          { ...asset, purchaseLots: lots },
          undefined,
          false
        );
        await onQuickUpdate({
          ...asset,
          purchaseLots: lots,
          quantity: remainingQty,
          avgCost: avgBuyCost,
          investedValue,
          updatedAt: Date.now(),
        });
      } else {
        const newLot = { id: crypto.randomUUID(), date, quantity: qtyNum, price: priceNum };
        const lots = [...(asset.shareLots ?? []), newLot];
        const { remainingQty, avgBuyCost, investedValue } = computeHoldingPnl(
          { ...asset, shareLots: lots },
          undefined,
          false
        );
        await onQuickUpdate({
          ...asset,
          shareLots: lots,
          quantity: remainingQty,
          avgCost: avgBuyCost,
          investedValue,
          updatedAt: Date.now(),
        });
      }
      onClose();
    } catch (err) {
      console.error('Buy failed', err);
      setError('Could not save this purchase. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const submitSell = async () => {
    const qtyNum = Number(qty);
    const priceNum = Number(price);
    const account = accounts.find((a) => a.id === accountId);
    if (!qtyNum || qtyNum <= 0 || !priceNum || priceNum <= 0) {
      setError('Enter a valid quantity and price.');
      return;
    }
    if (qtyNum > currentQty + 0.0001) {
      setError(`You only hold ${currentQty} ${unitLabel}.`);
      return;
    }
    if (accountId && !account) {
      setError('Pick an account to credit the sale proceeds to, or set it back to position only.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // Record the sale as a permanent, append-only entry instead of
      // reducing/removing buy lots — a holding's full purchase history
      // must survive selling, even once it's sold down to zero (it then
      // moves to Investments → Profit & Loss → Sold Investments instead
      // of disappearing). Realized P&L for this sale is locked in against
      // the moving weighted-average cost basis *as of right now* (see
      // src/utils/investmentPnl.ts), which stays fixed forever afterward
      // even if later buys change the holding's current average.
      const proceeds = qtyNum * priceNum;
      const { avgBuyCost } = computeHoldingPnl(asset, undefined, false);
      const saleLots = [
        ...(asset.saleLots ?? []),
        {
          id: crypto.randomUUID(),
          date,
          quantity: qtyNum,
          price: priceNum,
          costBasis: avgBuyCost,
          accountId: account?.id,
        },
      ];
      // Recompute the holding's live-facing summary fields (quantity/avg
      // cost/invested value) from the *permanent* lot history + the sale
      // ledger above — same moving-average math used everywhere else in
      // the app (Dashboard net worth, the Wealth grid, CSV export, etc.
      // all read these three fields directly) — while shareLots/
      // purchaseLots themselves are left completely untouched, so the
      // original buy history never shrinks even once every share is sold.
      const { remainingQty, avgBuyCost: remainingAvgCost, investedValue } = computeHoldingPnl(
        { ...asset, saleLots },
        undefined,
        false
      );
      await onQuickUpdate({
        ...asset,
        saleLots,
        quantity: remainingQty,
        avgCost: remainingAvgCost,
        investedValue,
        updatedAt: Date.now(),
      });

      if (account) {
        await onQuickUpdate({ ...account, value: (account.value ?? 0) + proceeds, updatedAt: Date.now() });
      }
      await onLogTransaction({
        id: crypto.randomUUID(),
        type: 'income',
        category: 'Investments',
        amount: proceeds,
        currency: asset.currency,
        date,
        note: `Sold ${qtyNum} ${unitLabel} of ${asset.name}`,
        profileId: asset.profileId,
      });
      onClose();
    } catch (err) {
      console.error('Sell failed', err);
      setError('Could not complete this sale. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const submitDividend = async () => {
    const amountNum = Number(amount);
    const account = accounts.find((a) => a.id === accountId);
    if (!amountNum || amountNum <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (accountId && !account) {
      setError('Pick an account to credit the dividend to, or set it back to position only.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (account) {
        await onQuickUpdate({ ...account, value: (account.value ?? 0) + amountNum, updatedAt: Date.now() });
      }
      await onLogTransaction({
        id: crypto.randomUUID(),
        type: 'income',
        category: 'Dividend',
        amount: amountNum,
        currency: asset.currency,
        date,
        note: `Dividend from ${asset.name}`,
        profileId: asset.profileId,
      });
      onClose();
    } catch (err) {
      console.error('Dividend failed', err);
      setError('Could not save this dividend. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = `mt-1 ${inputClasses}`;
  const title = mode === 'buy' ? 'Buy' : mode === 'sell' ? 'Sell' : 'Dividend';

  return (
    <Modal open={open} onClose={close} title={title}>
      <div className="space-y-4">
        {mode === 'buy' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted">Quantity ({unitLabel})</label>
              <input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 10" className={inputClass} autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Price per {isWeightTracked ? 'gram' : 'unit'}</label>
              <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 150" className={inputClass} />
            </div>
          </>
        )}

        {mode === 'sell' && (
          <>
            <div>
              <label className="text-xs font-medium text-muted">
                Quantity to sell ({unitLabel}) — you hold {currentQty}
              </label>
              <input type="number" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="e.g. 5" className={inputClass} autoFocus />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Sell price per {isWeightTracked ? 'gram' : 'unit'}</label>
              <input type="number" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 160" className={inputClass} />
            </div>
          </>
        )}

        {mode === 'dividend' && (
          <div>
            <label className="text-xs font-medium text-muted">Dividend amount</label>
            <input type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250" className={inputClass} autoFocus />
          </div>
        )}

        {(mode === 'sell' || mode === 'dividend') && (
          <div>
            <label className="text-xs font-medium text-muted">Credited to (optional)</label>
            {newAccountOpen ? (
              <div className="mt-1 border border-line rounded-lg p-3 space-y-2.5 bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">New account</p>
                  <button
                    type="button"
                    onClick={() => setNewAccountOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g. HDFC Savings"
                    className="border border-line bg-surface rounded-lg px-2.5 py-2 text-sm"
                    autoFocus
                  />
                  <CustomSelect
                    value={newAccountType}
                    onChange={(v) => setNewAccountType(v as Exclude<AccountType, 'credit_card'>)}
                    className="border border-line bg-surface rounded-lg px-2.5 py-2 text-sm"
                    options={ACCOUNT_TYPES.filter((t) => t.key !== 'credit_card').map((t) => ({ value: t.key, label: t.label }))}
                  />
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  value={newAccountBalance}
                  onChange={(e) => setNewAccountBalance(e.target.value)}
                  placeholder="Opening balance (optional)"
                  className="w-full border border-line bg-surface rounded-lg px-2.5 py-2 text-sm"
                />
                {newAccountError && <p className="text-xs text-red-600">{newAccountError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setNewAccountOpen(false)}
                    className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2 rounded-lg text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={creatingAccount}
                    onClick={handleCreateAccount}
                    className="flex-1 bg-brand-600 text-white py-2 rounded-lg text-xs font-medium hover:bg-brand-700 disabled:opacity-60"
                  >
                    {creatingAccount ? 'Adding…' : 'Add account'}
                  </button>
                </div>
              </div>
            ) : (
              <CustomSelect
                value={accountId}
                onChange={(v) => (v === '__new__' ? setNewAccountOpen(true) : setAccountId(v))}
                className={inputClass}
                options={[
                  { value: '', label: 'No cash account (position only)' },
                  ...accounts.map((a) => {
                    const type = (a.accountType ?? 'cash') as AccountType;
                    const Icon = resolveAccountIcon(a.icon, type);
                    const colour = a.colour || '#334155';
                    const groupLabel = ACCOUNT_TYPES.find((t) => t.key === type)?.label ?? 'Account';
                    return {
                      value: a.id,
                      group: groupLabel.toUpperCase(),
                      label: (
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="h-5 w-5 rounded-md flex items-center justify-center shrink-0"
                            style={{ backgroundColor: `${colour}1a`, color: colour }}
                          >
                            <Icon size={12} />
                          </span>
                          <span className="truncate">
                            {a.name}
                            {a.institution && <span className="text-slate-400"> · {a.institution}</span>}
                          </span>
                        </span>
                      ),
                    };
                  }),
                  {
                    value: '__new__',
                    label: (
                      <span className="flex items-center gap-2 text-brand-600 dark:text-brand-400 font-medium">
                        <Plus size={14} />
                        New account
                      </span>
                    ),
                  },
                ]}
              />
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-medium text-muted">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={close}
            className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={mode === 'buy' ? submitBuy : mode === 'sell' ? submitSell : submitDividend}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : title}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function AssetDetailPage({
  asset,
  onBack,
  onEdit,
  onDelete,
  onQuickUpdate,
}: {
  asset: Asset;
  onBack: () => void;
  onEdit: (a: Asset) => void;
  onDelete: (id: string) => void;
  onQuickUpdate: (a: Asset) => void | Promise<void>;
}) {
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const sipValuesAttempted = useLivePricesStore((s) => s.sipValuesAttempted);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const goldPriceError = useLivePricesStore((s) => s.goldPriceError);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const extra = asset as unknown as {
    isin?: string;
    sector?: string;
    geography?: string;
    notes?: string;
  };

  const { invested, value, pnl } = resolveAssetValues(asset, livePrices, sipValues, liveGoldPricePerGram);
  // Same reasoning as the list view: Current Value/P&L for a live-priced
  // asset (market symbol, or linked SIP) shouldn't show a stale cached
  // number while this session's price fetch is still in flight — Invested
  // is pure cost-basis and is never gated by this.
  const isGoldAsset = asset.assetClass === 'gold' && !!asset.quantity && asset.quantity > 0;
  const isLivePricedAsset =
    (!!asset.symbol && !!asset.quantity && asset.quantity > 0) ||
    (asset.assetClass === 'sip' && !!asset.symbol && /^\d+$/.test(asset.symbol)) ||
    isGoldAsset;
  const isSipLinked = asset.assetClass === 'sip' && !!asset.symbol && /^\d+$/.test(asset.symbol);
  const priceReady = isSipLinked
    ? sipValuesAttempted || sipValues[asset.symbol!.trim()] !== undefined
    : isGoldAsset
      ? liveGoldPricePerGram !== null || goldPriceError
      : pricesAttempted || livePrices[(asset.symbol ?? '').toUpperCase()] !== undefined;
  const valuePending = isLivePricedAsset && !priceReady;
  const category = ASSET_CLASS_TO_CATEGORY[asset.assetClass];
  const positive = (pnl ?? 0) >= 0;
  const recurringSip = asset.recurringInvestment ? computeSipProgress(asset) : undefined;
  const mfSipProgress = asset.assetClass === 'sip' ? computeSipProgress(asset) : undefined;

  const notesLine = [
    extra.isin ? `ISIN: ${extra.isin}` : null,
    extra.sector ? `Sector: ${extra.sector.toUpperCase()}` : null,
    pnl !== undefined
      ? `P&L: ${pnl >= 0 ? '+' : ''}${formatPreciseCurrency(pnl, asset.currency)}`
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
          <h2 className="text-2xl sm:text-3xl font-bold text-ink truncate">{asset.name}</h2>
          <p className="text-slate-600 text-sm">{category?.label ?? ASSET_CLASS_LABELS[asset.assetClass]}</p>
        </div>
        <button
          onClick={() => onEdit(asset)}
          title="Edit"
          className="h-9 w-9 flex items-center justify-center rounded-lg border border-line hover:bg-slate-50 text-slate-600 shrink-0"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={() => setConfirmDeleteOpen(true)}
          title="Delete"
          className="h-9 w-9 flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 shrink-0"
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
            className="flex-1 border border-line text-slate-600 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              setConfirmDeleteOpen(false);
              onDelete(asset.id);
            }}
            className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Delete
          </button>
        </div>
      </Modal>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-block bg-blue-50 text-blue-600 text-xs font-medium px-2.5 py-1 rounded-full">
            {category?.label ?? ASSET_CLASS_LABELS[asset.assetClass]}
          </span>
          <div className="text-right">
            <p className="text-xs text-slate-600 font-medium">INVESTED</p>
            <p className="text-base font-semibold text-ink">
              {formatPreciseCurrency(invested ?? value, asset.currency)}
            </p>
          </div>
        </div>
        <p className="text-4xl sm:text-5xl font-bold text-ink mt-3">
          {valuePending ? (
            <span className="inline-block h-8 w-32 rounded-lg bg-slate-100 animate-pulse align-middle" />
          ) : (
            maskPreciseAmount(value, asset.currency, privacyMode)
          )}
        </p>
        {valuePending ? (
          <span className="inline-block h-4 w-20 mt-1 rounded bg-slate-100 animate-pulse" />
        ) : (
          pnl !== undefined && (
            <p className={`flex items-center gap-1 text-sm font-medium mt-1 ${positive ? 'text-brand-600 dark:text-brand-300' : 'text-red-500 dark:text-red-400'}`}>
              {positive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
              {positive ? '+' : ''}
              {formatPreciseCurrency(pnl, asset.currency)}
            </p>
          )
        )}
      </div>

      <div className="bg-surface rounded-2xl border border-line p-5">
        <p className="text-xs font-semibold tracking-wide text-slate-600 mb-4">DETAILS</p>
        <div className="grid grid-cols-2 gap-y-4 gap-x-4">
          <DetailField label="PRODUCT TYPE" value={ASSET_CLASS_LABELS[asset.assetClass]} />
          <DetailField label="CURRENCY" value={asset.currency} />
          {asset.market && (
            <DetailField label="MARKET" value={asset.market === 'US' ? 'United States' : 'India'} />
          )}
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

      {asset.assetClass === 'sip' && mfSipProgress && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <p className="text-xs font-semibold tracking-wide text-slate-600 mb-4">SIP DETAILS</p>
          <div className="grid grid-cols-2 gap-y-4 gap-x-4">
            {asset.sipAmount !== undefined && (
              <DetailField
                label="INSTALLMENT"
                value={`${formatPreciseCurrency(asset.sipAmount, asset.currency)} / ${asset.sipFrequency === 'quarterly' ? 'quarter' : 'month'}`}
              />
            )}
            {asset.startDate && <DetailField label="STARTED" value={asset.startDate} />}
            <DetailField label="INSTALLMENTS SO FAR" value={`${mfSipProgress.installmentsElapsed}`} />
            <DetailField label="STATUS" value={mfSipProgress.isPaused ? 'Paused' : 'Active'} />
            {mfSipProgress.nextInstallmentDate && (
              <DetailField label="NEXT DUE" value={mfSipProgress.nextInstallmentDate} />
            )}
            {(asset.sipTopUps?.length ?? 0) > 0 && (
              <DetailField
                label="TOP-UPS SO FAR"
                value={formatPreciseCurrency(
                  asset.sipTopUps!.reduce((s, t) => s + t.amount, 0),
                  asset.currency
                )}
              />
            )}
          </div>
        </div>
      )}

      {asset.assetClass === 'sip' && <SipQuickActions asset={asset} onUpdate={onQuickUpdate} />}

      {asset.recurringInvestment && recurringSip && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <p className="text-xs font-semibold tracking-wide text-slate-600 mb-4">RECURRING INVESTMENT (SIP)</p>
          <div className="grid grid-cols-2 gap-y-4 gap-x-4">
            {asset.sipAmount !== undefined && (
              <DetailField
                label="INSTALLMENT"
                value={`${formatPreciseCurrency(asset.sipAmount, asset.currency)} / ${asset.sipFrequency === 'quarterly' ? 'quarter' : 'month'}`}
              />
            )}
            {asset.startDate && <DetailField label="STARTED" value={asset.startDate} />}
            <DetailField label="INSTALLMENTS SO FAR" value={`${recurringSip.installmentsElapsed}`} />
            {recurringSip.nextInstallmentDate && (
              <DetailField label="NEXT DUE" value={recurringSip.nextInstallmentDate} />
            )}
          </div>
          <p className="text-xs text-slate-600 mt-4">
            This is a reminder only — log each purchase as a new lot when editing this asset so
            quantity and average cost stay accurate.
          </p>
        </div>
      )}

      {notesLine && (
        <div className="bg-surface rounded-2xl border border-line p-5">
          <p className="text-xs font-semibold tracking-wide text-slate-600 mb-3">NOTES</p>
          <p className="text-sm text-slate-600 leading-relaxed">{notesLine}</p>
        </div>
      )}
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-600 mb-1">{label}</p>
      <p className="text-sm font-medium text-ink">{value}</p>
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
  onClose,
  onSave,
}: {
  category?: CategoryDef<AssetClass>;
  initial: Asset | null;
  initialType?: AssetClass;
  onBack?: () => void;
  /** Present only when this form is rendered inside the Edit Asset panel
   *  (see Wealth.tsx) — renders a page-style header ("Edit Asset" + type
   *  subtitle + "Back to Assets" link, matching the Add Asset flow's own
   *  header) and a Cancel button next to Save, instead of the wizard's
   *  "Back to asset type" link. */
  onClose?: () => void;
  onSave: (a: Asset) => void;
}) {
  // Some older saved assets carry an assetClass value from before the
  // taxonomy was reorganized, which no longer matches any known type. Left
  // as-is, the Asset Type <select> falls back to showing its first option
  // ("Direct Stock") purely as a browser display quirk, while the actual
  // state still holds the stale value — silently breaking checks like
  // SYMBOL_ENABLED_CLASSES.has(assetClass) and hiding the Symbol/Quantity/
  // Avg. Cost fields even though the dropdown looks like it says "Direct
  // Stock". Normalize here so state always matches what's shown.
  const isValidAssetClass = (v?: string | null): v is AssetClass => !!v && v in ASSET_CLASS_LABELS;
  const startClass: AssetClass = isValidAssetClass(initial?.assetClass)
    ? initial!.assetClass
    : initialType ?? 'stock';
  const effectiveCategory = category ?? ASSET_CLASS_TO_CATEGORY[startClass];

  const [name, setName] = useState(initial?.name ?? '');
  const [assetClass, setAssetClass] = useState<AssetClass>(startClass);
  // Collapsed by default when editing an existing asset — shows a
  // colored preview chip with a "Change" link instead of a raw <select>;
  // clicking Change (or, for a new asset, always) reveals the real select.
  const [assetTypeEditing, setAssetTypeEditing] = useState(!initial);
  const [value, setValue] = useState(initial?.value?.toString() ?? '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [symbol, setSymbol] = useState(initial?.symbol ?? '');
  const [quantity, setQuantity] = useState(initial?.quantity?.toString() ?? '');
  const [avgCost, setAvgCost] = useState(initial?.avgCost?.toString() ?? '');
  const [investedValue, setInvestedValue] = useState(initial?.investedValue?.toString() ?? '');
  const [institution, setInstitution] = useState(initial?.institution ?? '');
  // "Hide details" / "Show details" — collapses the less-common fields
  // below (Geography, Sub-class, Tags, Notes, and the two flags) out of
  // the way by default. Always starts collapsed on a fresh mount (a new
  // page load / refresh), even for an asset that already has some of
  // these filled in — expanding it is a per-visit action, not a
  // remembered preference.
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [geography, setGeography] = useState(initial?.geography ?? '');
  const [subClass, setSubClass] = useState(initial?.subClass ?? '');
  const [tags, setTags] = useState<string[]>(initial?.tags ?? []);
  const [tagDraft, setTagDraft] = useState('');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [excludeFromAllocation, setExcludeFromAllocation] = useState(initial?.excludeFromAllocation ?? false);
  const [emergencyFund, setEmergencyFund] = useState(initial?.emergencyFund ?? false);
  const addTag = (raw: string) => {
    const t = raw.trim().replace(/\s+/g, '-').toLowerCase();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagDraft('');
  };
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
  // --- Market (India / US) + recurring investment (SIP) for Stocks/ETFs/
  // International Equity ---------------------------------------------------
  const [market, setMarket] = useState<'IN' | 'US'>(initial?.market ?? 'IN');
  const isMarketSelectable = MARKET_SELECTABLE_CLASSES.has(assetClass);
  const isRecurringEligible = RECURRING_ELIGIBLE_CLASSES.has(assetClass);
  const [recurringInvestment, setRecurringInvestment] = useState(
    initial?.recurringInvestment ?? false
  );
  // Only auto-flip Currency to match a newly picked Market on a *new* asset —
  // never clobber a currency the person already saved or hand-picked.
  const currencyTouchedRef = useRef(!!initial);
  useEffect(() => {
    if (!isMarketSelectable || currencyTouchedRef.current) return;
    setCurrency(market === 'US' ? 'USD' : 'INR');
  }, [market, isMarketSelectable]);

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

  // --- Unit-tracked purchases (Stocks / ETFs / Mutual Funds / Crypto, etc.) -
  // Same idea as the weight-tracked lots above, but for share/unit-based
  // holdings: each buy is its own lot (quantity + price paid per unit).
  // Bought more later at a different price? Add another row — total
  // quantity and the weighted-average cost are computed automatically.
  const isUnitTrackedClass = (c: AssetClass) => SYMBOL_ENABLED_CLASSES.has(c) && !SIP_CLASSES.has(c);
  const [shareLots, setShareLots] = useState<
    { id: string; date?: string; quantity: string; price: string }[]
  >(() => {
    if (initial?.shareLots?.length) {
      return initial.shareLots.map((l) => ({
        id: l.id,
        date: l.date,
        quantity: l.quantity?.toString() ?? '',
        price: l.price?.toString() ?? '',
      }));
    }
    if (isUnitTrackedClass(startClass) && (initial?.quantity || initial?.avgCost)) {
      return [
        {
          id: crypto.randomUUID(),
          date: initial?.startDate,
          quantity: initial?.quantity?.toString() ?? '',
          price: initial?.avgCost?.toString() ?? '',
        },
      ];
    }
    return isUnitTrackedClass(startClass) ? [{ id: crypto.randomUUID(), quantity: '', price: '' }] : [];
  });
  const isUnitTracked = isUnitTrackedClass(assetClass);
  const totalShareQty = Math.round(
    shareLots.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0) * 10000
  ) / 10000;
  const totalShareInvested = shareLots.reduce(
    (sum, l) => sum + (Number(l.quantity) || 0) * (Number(l.price) || 0),
    0
  );
  // Weighted-average cost = total paid ÷ total units — this is the "average"
  // the person ends up holding at once they've bought at more than one price.
  const weightedAvgCost = totalShareQty > 0 ? totalShareInvested / totalShareQty : 0;

  // The rows above are always the FULL lifetime buy history (this form
  // edits shareLots directly and never sees/touches saleLots), so the
  // quantity/avg-cost/invested-value actually SAVED to the asset must
  // account for anything already sold via the Sell action — otherwise
  // just opening and saving this form after a sale would silently undo
  // it by resurrecting the sold quantity. See utils/investmentPnl.ts.
  const netHoldingFromForm = computeHoldingPnl(
    {
      ...(initial ?? ({} as Partial<Asset>)),
      id: initial?.id ?? 'draft',
      name: initial?.name ?? '',
      assetClass,
      currency: initial?.currency ?? 'INR',
      value: 0,
      updatedAt: Date.now(),
      shareLots: isUnitTracked
        ? shareLots
            .filter((l) => Number(l.quantity) > 0 && Number(l.price) > 0)
            .map((l) => ({ id: l.id, date: l.date, quantity: Number(l.quantity) || 0, price: Number(l.price) || 0 }))
        : undefined,
      purchaseLots: isWeightTracked
        ? purchaseLots
            .filter((l) => Number(l.grams) > 0 && Number(l.amount) > 0)
            .map((l) => ({ id: l.id, date: l.date, grams: Number(l.grams) || 0, amount: Number(l.amount) || 0 }))
        : undefined,
      saleLots: initial?.saleLots,
    } as Asset,
    undefined,
    false
  );
  const netShareQty = isUnitTracked ? netHoldingFromForm.remainingQty : totalShareQty;
  const netShareAvgCost = isUnitTracked ? netHoldingFromForm.avgBuyCost : weightedAvgCost;
  const netShareInvested = isUnitTracked ? netHoldingFromForm.investedValue : totalShareInvested;

  const addShareLot = () =>
    setShareLots((rows) => [...rows, { id: crypto.randomUUID(), quantity: '', price: '' }]);
  const removeShareLot = (id: string) =>
    setShareLots((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const updateShareLot = (id: string, patch: Partial<{ date: string; quantity: string; price: string }>) =>
    setShareLots((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  // --- "Invest ₹100 in a $354 stock" — per-purchase amount-in-another-
  // currency entry ---------------------------------------------------------
  // Each lot can be filled in either by Quantity (the usual way) or by an
  // Amount typed in whichever currency the person actually paid in. When a
  // lot is in "amount" mode, its Quantity is derived — never hand-typed —
  // by converting that amount into the asset's own currency at the live FX
  // rate and dividing by Price/Unit, same idea as a real fractional-share
  // brokerage order. Only offered where the "other" currency is well-defined:
  // market-selectable classes (Stock/ETF/International Equity), where it's
  // always USD vs INR.
  const otherCurrency = currency === 'USD' ? 'INR' : 'USD';
  const [lotInputMode, setLotInputMode] = useState<Record<string, 'qty' | 'amount'>>({});
  const [lotAmount, setLotAmount] = useState<Record<string, string>>({});
  const [lotAmountCurrency, setLotAmountCurrency] = useState<Record<string, string>>({});
  // Price/Unit can likewise be typed in either currency — e.g. an Indian
  // investor who paid in ₹ for a US stock and only knows the INR price per
  // share. `lotPriceRaw` is what's actually typed (in `lotPriceCurrency`);
  // `lot.price` itself always stays in the asset's own currency (converted
  // at the live FX rate), since that's what every other calculation
  // (avg. cost, invested value, live-price comparisons) assumes it's in.
  const [lotPriceRaw, setLotPriceRaw] = useState<Record<string, string>>({});
  const [lotPriceCurrency, setLotPriceCurrency] = useState<Record<string, string>>({});
  // Once there are 2+ purchase entries, each is collapsible to a single
  // summary line (see "Purchase N" row below) so a long purchase history
  // doesn't turn the form into an endless scroll. Which entries are
  // collapsed is remembered per-asset in localStorage, so expanding one to
  // check or edit it and then refreshing the page doesn't silently put it
  // back the way it was — the seed value (before any toggle has ever been
  // saved) collapses every already-saved purchase and leaves a freshly
  // added one expanded, since that's the one the person is actively filling
  // in.
  const collapseStorageKey = initial?.id ? `assetLotCollapse:${initial.id}` : null;
  const [collapsedLotIds, setCollapsedLotIds] = useState<Set<string>>(() => {
    if (collapseStorageKey) {
      try {
        const saved = localStorage.getItem(collapseStorageKey);
        if (saved) return new Set(JSON.parse(saved));
      } catch {
        // Corrupt/unavailable storage — fall through to the default seed.
      }
    }
    return new Set([
      ...(initial?.shareLots?.map((l) => l.id) ?? []),
      ...(initial?.purchaseLots?.map((l) => l.id) ?? []),
    ]);
  });
  const toggleLotCollapsed = (id: string) => {
    setCollapsedLotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (collapseStorageKey) {
        try {
          localStorage.setItem(collapseStorageKey, JSON.stringify([...next]));
        } catch {
          // Storage full/unavailable — the toggle still works for this
          // session, it just won't survive a refresh.
        }
      }
      return next;
    });
  };
  const [fxRate, setFxRate] = useState<number | null>(null);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxFailed, setFxFailed] = useState(false);

  const anyLotNeedsFx = shareLots.some(
    (lot) =>
      (lotInputMode[lot.id] === 'amount' && (lotAmountCurrency[lot.id] ?? otherCurrency) !== currency) ||
      (lotPriceCurrency[lot.id] ?? currency) !== currency
  );

  // Fetch (and refetch on currency flip) the rate to convert the "other"
  // currency into whatever currency the asset itself is tracked in.
  useEffect(() => {
    if (!isMarketSelectable || !anyLotNeedsFx) return;
    let cancelled = false;
    setFxLoading(true);
    setFxFailed(false);
    fetchFxRate(otherCurrency, currency).then((rate) => {
      if (cancelled) return;
      setFxLoading(false);
      if (rate === null) {
        setFxFailed(true);
      } else {
        setFxFailed(false);
        setFxRate(rate);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketSelectable, anyLotNeedsFx, otherCurrency, currency]);

  const setLotMode = (id: string, mode: 'qty' | 'amount') => {
    setLotInputMode((m) => ({ ...m, [id]: mode }));
    if (mode === 'amount' && !lotAmountCurrency[id]) {
      setLotAmountCurrency((m) => ({ ...m, [id]: otherCurrency }));
    }
  };

  // Shared by both the simple (single-purchase) and detailed (multi-lot)
  // Price/Unit currency selects — converts the currently displayed number
  // into the newly chosen currency rather than copying the digits over
  // unconverted, which would silently corrupt the saved cost basis (e.g. a
  // $1.05 price becoming "₹1.05"). Clears the box if we can't convert
  // safely yet, so a stale, wrong number is never trusted over a blank one.
  const handleLotPriceCurrencyChange = (lotId: string, nextCurrency: string, lotPrice: string) => {
    const prevCurrency = lotPriceCurrency[lotId] ?? currency;
    setLotPriceCurrency((m) => ({ ...m, [lotId]: nextCurrency }));
    if (nextCurrency === prevCurrency) return;
    const curRaw = lotPriceRaw[lotId] !== undefined ? Number(lotPriceRaw[lotId]) : Number(lotPrice);
    if (curRaw && fxRate !== null) {
      const converted = prevCurrency === currency ? curRaw / fxRate : curRaw * fxRate;
      setLotPriceRaw((m) => ({ ...m, [lotId]: converted > 0 ? converted.toFixed(6) : '' }));
    } else {
      setLotPriceRaw((m) => ({ ...m, [lotId]: '' }));
    }
  };

  // Re-derive Quantity for every lot currently in "amount" mode whenever its
  // amount, its chosen currency, the price/unit, or the FX rate changes.
  useEffect(() => {
    if (!isMarketSelectable) return;
    shareLots.forEach((lot) => {
      if (lotInputMode[lot.id] !== 'amount') return;
      const amt = Number(lotAmount[lot.id]);
      const price = Number(lot.price);
      if (!amt || amt <= 0 || !price || price <= 0) return;
      const amtCurrency = lotAmountCurrency[lot.id] ?? otherCurrency;
      const convertedAmt = amtCurrency === currency ? amt : fxRate !== null ? amt * fxRate : null;
      if (convertedAmt === null) return; // rate hasn't loaded yet
      const qty = convertedAmt / price;
      const qtyStr = qty > 0 ? qty.toFixed(6) : '';
      if (qtyStr !== lot.quantity) updateShareLot(lot.id, { quantity: qtyStr });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketSelectable, shareLots, lotInputMode, lotAmount, lotAmountCurrency, fxRate, otherCurrency, currency]);

  // Re-derive Price/Unit (in the asset's own currency) whenever the raw
  // typed price, its chosen currency, or the FX rate changes.
  useEffect(() => {
    if (!isMarketSelectable) return;
    shareLots.forEach((lot) => {
      const rawStr = lotPriceRaw[lot.id];
      if (rawStr === undefined) return; // untouched — price box is still bound directly
      const priceCurrency = lotPriceCurrency[lot.id] ?? currency;
      const raw = Number(rawStr);
      if (!raw || raw <= 0) {
        if (lot.price !== '') updateShareLot(lot.id, { price: '' });
        return;
      }
      const converted = priceCurrency === currency ? raw : fxRate !== null ? raw * fxRate : null;
      if (converted === null) return; // rate hasn't loaded yet
      const priceStr = converted > 0 ? converted.toFixed(6) : '';
      if (priceStr !== lot.price) updateShareLot(lot.id, { price: priceStr });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMarketSelectable, shareLots, lotPriceRaw, lotPriceCurrency, fxRate, currency]);

  // Quantity and Avg. Cost always mirror the lot totals for unit-tracked
  // assets — they're derived, never hand-typed directly, same as grams/
  // invested are for weight-tracked assets above.
  useEffect(() => {
    if (!isUnitTracked) return;
    setQuantity(netShareQty > 0 ? String(netShareQty) : '');
    setAvgCost(netShareAvgCost > 0 ? String(Number(netShareAvgCost.toFixed(4))) : '');
    setInvestedValue(netShareInvested > 0 ? String(netShareInvested) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUnitTracked, netShareQty, netShareInvested]);
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
  // For existing assets, preserve the saved current value (don't overwrite with invested amount).
  const valueTouchedRef = useRef(!!initial?.value);
  useEffect(() => {
    if (!isWeightTracked) return;
    setQuantity(netShareQty > 0 ? String(netShareQty) : '');
    setInvestedValue(netShareInvested > 0 ? String(netShareInvested) : '');
    if (!valueTouchedRef.current) setValue(totalPurchaseAmount > 0 ? String(totalPurchaseAmount) : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWeightTracked, netShareQty, netShareInvested, totalPurchaseAmount]);

  // --- Gold purity live pricing (24K / 22K) -------------------------------
  // Gold-only: lets the person pick 24K or 22K and have Current Value
  // auto-fill from the app-wide live gold rate (see useLiveGoldPrice /
  // livePricesStore, already polling in the background) × total grams
  // purchased — the same "digital gold app" style quote as the Dashboard
  // ticker. 22K is derived from the live 24K rate at the standard 22/24
  // purity ratio. This is estimate-only, but the chosen purity IS saved on
  // the asset (see onSave below) so Current Value / Return can keep
  // tracking the live rate everywhere the asset is shown afterwards
  // (resolveAssetValues), not just refresh once here while the form is
  // open. Selecting a purity re-enables auto-fill even if the person had
  // previously hand-edited Current Value, since that's a fresh, explicit
  // choice to go live.
  const isGold = assetClass === 'gold';
  const [goldPurity, setGoldPurity] = useState<'24k' | '22k' | null>(initial?.goldPurity ?? null);
  const liveGold24k = useLivePricesStore((s) => s.goldPricePerGram);
  const liveGoldLoading = useLivePricesStore((s) => s.goldPriceLoading);
  const liveGoldError = useLivePricesStore((s) => s.goldPriceError);
  const goldPurityPricePerGram =
    liveGold24k === null ? null : goldPurity === '22k' ? goldPricePerGram22k(liveGold24k) : liveGold24k;

  const selectGoldPurity = (purity: '24k' | '22k') => {
    setGoldPurity(purity);
    valueTouchedRef.current = false;
  };

  useEffect(() => {
    if (!isGold || !goldPurity || goldPurityPricePerGram === null) return;
    if (valueTouchedRef.current) return;
    if (netShareQty > 0) setValue((goldPurityPricePerGram * netShareQty).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGold, goldPurity, goldPurityPricePerGram, netShareQty]);

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

  // --- Auto-calculated Current Value (Stocks / ETFs / Equity & Index Funds /
  // Crypto — any SYMBOL_ENABLED_CLASSES entry other than SIP, which has its
  // own NAV-based calc above). Fetches a live quote for the symbol and sets
  // Current Value to quantity × live price, same as resolveAssetValues()
  // does for the saved asset list — so what's typed while adding/editing
  // matches what the dashboard will show. Respects valueTouchedRef, so once
  // the person hand-edits Current Value themselves, auto-fill backs off.
  const [equityLiveLoading, setEquityLiveLoading] = useState(false);
  const [equityLiveError, setEquityLiveError] = useState(false);
  const [equityLivePrice, setEquityLivePrice] = useState<number | null>(null);
  const isEquityLive = SYMBOL_ENABLED_CLASSES.has(assetClass) && !isSip && !isWeightTracked;

  // --- Symbol autocomplete (Stocks / ETFs / International Equity) --------
  // Lets people type a company name (or a misspelled/half-remembered
  // ticker, e.g. "GOOGLE") and pick the real trading symbol from a list,
  // instead of having to already know it's "GOOGL". Only offered for
  // unit-tracked, market-selectable classes — SIP has its own fund search.
  const [symbolSuggestions, setSymbolSuggestions] = useState<StockSearchResult[]>([]);
  const [symbolSearchOpen, setSymbolSearchOpen] = useState(false);
  const [symbolSearchLoading, setSymbolSearchLoading] = useState(false);
  const [symbolSearchFailed, setSymbolSearchFailed] = useState(false);
  const [symbolSearchedQuery, setSymbolSearchedQuery] = useState('');
  const symbolTouched = useRef(false);
  const symbolIsSearchable = isUnitTracked;

  useEffect(() => {
    if (!symbolIsSearchable || !symbolTouched.current) return;
    const q = symbol.trim();
    if (q.length < 3) {
      setSymbolSuggestions([]);
      return;
    }
    setSymbolSearchLoading(true);
    const timer = setTimeout(() => {
      searchStockSymbols(q, isMarketSelectable ? market : 'IN').then((results) => {
        setSymbolSearchLoading(false);
        setSymbolSearchedQuery(q);
        if (results === null) {
          setSymbolSearchFailed(true);
          setSymbolSuggestions([]);
        } else {
          setSymbolSearchFailed(false);
          setSymbolSuggestions(results);
        }
        setSymbolSearchOpen(true);
      });
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, symbolIsSearchable, market, isMarketSelectable]);

  const selectSymbol = (result: StockSearchResult) => {
    symbolTouched.current = false; // selecting shouldn't immediately re-trigger a search
    setSymbol(result.symbol);
    setSymbolSuggestions([]);
    setSymbolSearchOpen(false);
    if (!name.trim() && result.name) setName(result.name);
  };

  useEffect(() => {
    if (!isEquityLive) {
      setEquityLivePrice(null);
      setEquityLiveError(false);
      setEquityLiveLoading(false);
      return;
    }
    const sym = symbol.trim();
    // Default Quantity to 1 the moment a symbol is typed in, if the person
    // hasn't set a quantity yet — keeps it editable, just gives a sensible
    // starting point so Current Value can auto-calculate right away. Skipped
    // for unit-tracked assets, where Quantity is derived from the purchase
    // lots below instead of being hand-typed.
    let qty = Number(quantity);
    if (sym && (!quantity || qty <= 0) && !isUnitTracked) {
      qty = 1;
      setQuantity('1');
    }
    if (!sym || !qty || qty <= 0) {
      setEquityLivePrice(null);
      setEquityLiveError(false);
      setEquityLiveLoading(false);
      return;
    }

    let cancelled = false;
    setEquityLiveLoading(true);
    setEquityLiveError(false);
    const timer = setTimeout(() => {
      fetchLivePrices([{ key: sym, name, market: isMarketSelectable ? market : undefined }]).then((priceMap) => {
        if (cancelled) return;
        setEquityLiveLoading(false);
        const price = priceMap.get(sym.toUpperCase());
        if (price === undefined) {
          setEquityLivePrice(null);
          setEquityLiveError(true);
          return;
        }
        setEquityLivePrice(price);
        if (!valueTouchedRef.current) setValue((qty * price).toFixed(2));
      });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEquityLive, symbol, quantity, market, isMarketSelectable]);

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

  // Reminder-only progress for a recurring Stock/ETF/Intl. Equity SIP —
  // unlike the Mutual Fund SIP above, this never drives Current Value
  // (no free per-day historical price feed for arbitrary stocks); it just
  // tells the person how many installments are due and when the next is.
  const stockSipProgress =
    isRecurringEligible && recurringInvestment
      ? computeSipProgress({
          id: initial?.id ?? '',
          name,
          assetClass,
          value: Number(value) || 0,
          currency,
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
      market: isMarketSelectable ? market : undefined,
      quantity: qty,
      avgCost: avg,
      investedValue: invested,
      pnl: invested !== undefined ? Number(value) - invested : undefined,
      pnlPercent:
        invested !== undefined && invested > 0
          ? ((Number(value) - invested) / invested) * 100
          : undefined,
      institution: institution.trim() || undefined,
      geography: (geography || undefined) as Asset['geography'],
      subClass: subClass.trim() || undefined,
      tags: tags.length ? tags : undefined,
      notes: notes.trim() || undefined,
      excludeFromAllocation: excludeFromAllocation || undefined,
      emergencyFund: emergencyFund || undefined,
      interestRate: interestRate ? Number(interestRate) : undefined,
      startDate: startDate || undefined,
      maturityDate: maturityDate || undefined,
      monthlyInstallment: monthlyInstallment ? Number(monthlyInstallment) : undefined,
      recurringInvestment: isRecurringEligible ? recurringInvestment : undefined,
      sipAmount:
        (SIP_CLASSES.has(assetClass) || (isRecurringEligible && recurringInvestment)) && sipAmount
          ? Number(sipAmount)
          : undefined,
      sipFrequency:
        SIP_CLASSES.has(assetClass) || (isRecurringEligible && recurringInvestment)
          ? sipFrequency
          : undefined,
      sipDay:
        (SIP_CLASSES.has(assetClass) || (isRecurringEligible && recurringInvestment)) && sipDay
          ? Number(sipDay)
          : undefined,
      order: initial?.order,
      goldPurity: isGold ? (goldPurity ?? initial?.goldPurity) : undefined,
      updatedAt: Date.now(),
      // Only keep purchase rows the person actually finished filling in —
      // a row with just grams or just an amount (not both) contributes
      // nothing to the totals anyway (see totalShareQty/weightedAvgCost
      // above), so saving it as quantity/amount: 0 would silently persist
      // a broken half-entered row instead of just dropping it. The inline
      // warning under each row (rendered below) tells the person why
      // before they hit Save, so nothing vanishes as a surprise.
      purchaseLots: isWeightTracked
        ? purchaseLots
            .filter((l) => Number(l.grams) > 0 && Number(l.amount) > 0)
            .map((l) => ({
              id: l.id,
              date: l.date || undefined,
              grams: Number(l.grams) || 0,
              amount: Number(l.amount) || 0,
            }))
        : undefined,
      shareLots: isUnitTracked
        ? shareLots
            .filter((l) => Number(l.quantity) > 0 && Number(l.price) > 0)
            .map((l) => ({
              id: l.id,
              date: l.date || undefined,
              quantity: Number(l.quantity) || 0,
              price: Number(l.price) || 0,
            }))
        : undefined,
    });
  };

  // Name + Currency, shown together as a pair — positioned right after the
  // Asset Type box for classes with no purchases/shares section above it,
  // or right after that section (see isUnitTracked branch below) for
  // Stock/ETF-like classes, matching where it naturally falls once shares
  // and price are already on the screen.
  const nameCurrencyField = (
    <div className="grid grid-cols-[1fr_128px] gap-3">
      <Field label={isUnitTracked ? 'Name' : <>Name <span className="text-red-500">*</span></>}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          className={`${inputClass} ${attemptedSubmit && nameMissing ? errorInputClass : ''}`}
          placeholder=""
        />
        {attemptedSubmit && nameMissing && <p className={errorTextClass}>Name is required.</p>}
      </Field>
      <Field label="Currency">
        <CurrencySelect
          value={currency}
          onChange={(c) => {
            currencyTouchedRef.current = true;
            setCurrency(c);
          }}
          className={inputClass}
        />
      </Field>
    </div>
  );

  return (
    <div className="space-y-4">
      {onClose ? (
        <div className="flex items-start justify-between gap-3 -mx-4 sm:-mx-6 -mt-5 mb-1 px-4 sm:px-6 py-4 bg-[#F2E4CC] dark:bg-[#3A3020] border-b border-[#E3CBA0] dark:border-[#5A4A2E]">
          <div>
            <h2 className="text-xl font-bold text-ink">Edit Asset</h2>
            <p className="text-muted text-sm mt-0.5">
              {ASSET_CLASS_LABELS[assetClass] ?? assetClass}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 shrink-0"
          >
            <ArrowLeft size={16} /> Back to Assets
          </button>
        </div>
      ) : (
        onBack && (
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-600 -mt-1"
          >
            <ArrowLeft size={16} /> Back to asset type
          </button>
        )
      )}
      {isUnitTracked && nameCurrencyField}
      <div className={isMarketSelectable ? 'grid grid-cols-2 gap-3 items-start' : ''}>
        {initial ? (
          <Field label="Asset Type">
            {assetTypeEditing ? (
              <>
                <CustomSelect
                  defaultOpen
                  value={assetClass}
                  onChange={(v) => {
                    setAssetClass(v as AssetClass);
                  }}
                  onOpenChange={(open) => {
                    if (!open) setAssetTypeEditing(false);
                  }}
                  className={`${inputClass} bg-white text-ink-2`}
                  options={ASSET_TAXONOMY.flatMap((cat) =>
                    cat.types.map((t) => ({ value: t.value, label: t.label, group: cat.label }))
                  )}
                />
                {ASSET_CLASS_TO_CATEGORY[assetClass]?.key !== effectiveCategory?.key && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    This will move the asset from {effectiveCategory?.label} to{' '}
                    {ASSET_CLASS_TO_CATEGORY[assetClass]?.label}.
                  </p>
                )}
              </>
            ) : (
              <button
                type="button"
                onClick={() => setAssetTypeEditing(true)}
                className="w-full flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-3 text-left"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="h-9 w-9 shrink-0 rounded-lg bg-white dark:bg-slate-800 flex items-center justify-center text-emerald-600">
                    {(() => {
                      const CatIcon = ASSET_CLASS_TO_CATEGORY[assetClass]?.icon ?? TrendingUp;
                      return <CatIcon size={16} />;
                    })()}
                  </span>
                  <span className="text-sm font-medium text-ink truncate">
                    {ASSET_CLASS_LABELS[assetClass] ?? assetClass}
                  </span>
                </span>
                <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400 shrink-0">Change</span>
              </button>
            )}
          </Field>
        ) : effectiveCategory && effectiveCategory.types.length > 1 ? (
          <Field label={`${effectiveCategory.label} Type`}>
            <CustomSelect
              value={assetClass}
              onChange={(v) => setAssetClass(v as AssetClass)}
              className={`${inputClass} bg-white text-ink-2`}
              options={[
                ...(!effectiveCategory.types.some((t) => t.value === assetClass)
                  ? [{ value: assetClass, label: ASSET_CLASS_LABELS[assetClass] ?? assetClass }]
                  : []),
                ...effectiveCategory.types.map((t) => ({ value: t.value, label: t.label })),
              ]}
            />
          </Field>
        ) : (
          <Field label="Asset Type">
            <p className="text-sm font-medium text-ink-2 border border-line rounded-lg px-3 py-2.5 bg-slate-50">
              {ASSET_CLASS_LABELS[assetClass] ?? assetClass ?? 'Unknown'}
            </p>
          </Field>
        )}
        {isMarketSelectable && (
          <Field label="Market">
            <CustomSelect
              value={market}
              onChange={(v) => setMarket(v as 'IN' | 'US')}
              className={`${inputClass} bg-white text-ink-2`}
              options={[
                { value: 'IN', label: '🇮🇳 India (NSE / BSE)' },
                { value: 'US', label: '🇺🇸 United States (NASDAQ / NYSE)' },
              ]}
            />
          </Field>
        )}
      </div>
      {!isUnitTracked && nameCurrencyField}
      {isGold && (
        <Field label="Gold Purity">
          <div className="grid grid-cols-2 gap-3">
            {(['24k', '22k'] as const).map((purity) => {
              const price =
                liveGold24k === null
                  ? null
                  : purity === '22k'
                    ? goldPricePerGram22k(liveGold24k)
                    : liveGold24k;
              const selected = goldPurity === purity;
              return (
                <button
                  key={purity}
                  type="button"
                  onClick={() => selectGoldPurity(purity)}
                  className={`text-left rounded-xl border p-3.5 transition-colors ${
                    selected
                      ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                      : 'border-line bg-surface hover:border-slate-300'
                  }`}
                >
                  <span
                    className={`text-sm font-semibold ${selected ? 'text-brand-700' : 'text-ink-2'}`}
                  >
                    {purity === '24k' ? '24K (999)' : '22K (916)'}
                  </span>
                  <p className="font-numeric text-sm mt-1 text-slate-600">
                    {liveGoldLoading && price === null
                      ? 'Loading…'
                      : price !== null
                        ? `${formatPreciseCurrency(price, 'INR')}/g`
                        : 'Unavailable'}
                  </p>
                </button>
              );
            })}
          </div>
          {liveGoldError && liveGold24k === null && (
            <p className={errorTextClass}>Couldn't fetch a live gold rate — enter Current Value manually.</p>
          )}
          {goldPurity && (
            <p className="text-xs text-slate-600 mt-1.5">
              Current Value below is set to live {goldPurity === '24k' ? '24K' : '22K'} rate × total grams —
              this is a global spot estimate, not an exact local jeweller rate. Edit it to override.
            </p>
          )}
        </Field>
      )}
      {isWeightTracked && (
        <div className="space-y-3 border border-line-soft bg-slate-50/60 rounded-xl p-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <p className="text-sm font-medium text-ink-2">Purchases</p>
            <p className="text-xs text-slate-500">
              Total: <span className="font-semibold text-brand-700">{totalGrams || 0} g</span>
              {' · '}
              {formatPreciseCurrency(totalPurchaseAmount, currency)}
            </p>
          </div>
          <div className="space-y-2.5">
            {purchaseLots.map((lot, i) => {
              const gramsFilled = Number(lot.grams) > 0;
              const amountFilled = Number(lot.amount) > 0;
              const lotIncomplete = gramsFilled !== amountFilled;
              // Every purchase gets the collapse arrow now, even a lone one —
              // collapsing it hides the input fields but keeps the summary
              // line, which is useful as soon as it's filled in, not just
              // once there's a second entry to compare it against.
              const collapsible = true;
              const collapsed = collapsible && collapsedLotIds.has(lot.id);
              return (
                <div
                  key={lot.id}
                  className="rounded-lg border border-slate-200 bg-white dark:bg-slate-800/60 dark:border-slate-700 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => collapsible && toggleLotCollapsed(lot.id)}
                      disabled={!collapsible}
                      className={`flex items-center gap-1.5 min-w-0 text-left ${collapsible ? 'cursor-pointer' : ''}`}
                    >
                      {collapsible && (
                        <ChevronDown
                          size={15}
                          className={`shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                        />
                      )}
                      <span className="text-xs font-medium text-slate-600 shrink-0">Purchase {i + 1}</span>
                      {collapsed && (
                        <span className="text-xs text-slate-400 truncate">
                          {[
                            lot.date || null,
                            gramsFilled ? `${lot.grams} g` : null,
                            amountFilled ? formatPreciseCurrency(Number(lot.amount), currency) : null,
                          ]
                            .filter(Boolean)
                            .join(' · ') || 'Not filled in yet'}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm('Remove this purchase entry?')) removePurchaseLot(lot.id);
                      }}
                      disabled={purchaseLots.length === 1}
                      className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                      title="Remove this purchase"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                  {!collapsed && (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Field label="Date">
                          <input
                            type="date"
                            value={lot.date ?? ''}
                            onChange={(e) => updatePurchaseLot(lot.id, { date: e.target.value })}
                            className={inputClass}
                          />
                        </Field>
                        <Field label="Grams">
                          <input
                            type="number"
                            step="any"
                            value={lot.grams}
                            onChange={(e) => updatePurchaseLot(lot.id, { grams: e.target.value })}
                            className={inputClass}
                            placeholder="e.g. 10"
                          />
                        </Field>
                        <Field label="Amount Paid">
                          <input
                            type="number"
                            step="any"
                            value={lot.amount}
                            onChange={(e) => updatePurchaseLot(lot.id, { amount: e.target.value })}
                            className={inputClass}
                            placeholder="e.g. 65000"
                          />
                        </Field>
                      </div>
                      {lotIncomplete && (
                        <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                          {gramsFilled
                            ? "Add an Amount Paid for this purchase — it won't count toward the total until both are filled in."
                            : "Add the Grams for this purchase — it won't count toward the total until both are filled in."}
                        </p>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={addPurchaseLot}
            className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            <Plus size={16} /> Add another purchase
          </button>
          <p className="text-xs text-slate-600">
            Bought more later? Come back to Edit and add another purchase row — grams and amount add
            up automatically.
          </p>
        </div>
      )}
      {isUnitTracked && (
        <>
          <Field label={<>Ticker <span className="text-red-500">*</span></>}>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={symbol}
                onChange={(e) => {
                  symbolTouched.current = true;
                  setSymbol(e.target.value.toUpperCase());
                }}
                onFocus={() => symbolSuggestions.length > 0 && setSymbolSearchOpen(true)}
                onBlur={() => setTimeout(() => setSymbolSearchOpen(false), 150)}
                className={`${inputClass} uppercase pl-9 ${symbolSearchLoading ? 'pr-9' : ''}`}
                placeholder="Search stock ticker..."
                autoComplete="off"
              />
              {symbolSearchLoading && (
                <Loader2
                  size={16}
                  className="animate-spin text-slate-600 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
              {symbolSearchOpen && symbolSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-surface border border-line rounded-lg shadow-lg">
                  {symbolSuggestions.map((s) => (
                    <button
                      key={s.symbol}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectSymbol(s)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-line-soft last:border-0 flex items-center justify-between gap-3"
                    >
                      <span className="truncate">
                        <span className="font-semibold">{s.symbol}</span>
                        {s.name && s.name !== s.symbol && (
                          <span className="text-slate-500"> — {s.name}</span>
                        )}
                      </span>
                      {s.exchDisp && (
                        <span className="text-xs text-slate-600 shrink-0">{s.exchDisp}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {symbolSearchOpen &&
                !symbolSearchLoading &&
                symbolSuggestions.length === 0 &&
                symbol.trim() === symbolSearchedQuery &&
                symbol.trim().length >= 3 && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-lg px-3 py-2 text-sm">
                    {symbolSearchFailed ? (
                      <span className="text-red-500">
                        Couldn't reach symbol search — check your connection, or enter the ticker directly.
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        No matches for "{symbolSearchedQuery}". Try just the company name, e.g. "Google".
                      </span>
                    )}
                  </div>
                )}
            </div>
          </Field>
          {shareLots.length === 1 && (lotInputMode[shareLots[0].id] ?? 'qty') === 'qty' ? (
            // The common case — one purchase, no other-currency entry — gets
            // the plain "No. of Shares / Avg. Purchase Price" layout instead
            // of the boxed, numbered "Purchase 1" editor below. Adding a
            // second purchase (or switching to "paid in {otherCurrency}")
            // falls through to that full multi-lot editor automatically,
            // so nothing about multi-lot/FX support is actually lost.
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <Field label="Date">
                  <input
                    type="date"
                    value={shareLots[0].date ?? ''}
                    onChange={(e) => updateShareLot(shareLots[0].id, { date: e.target.value })}
                    className={inputClass}
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    step="any"
                    value={shareLots[0].quantity}
                    onChange={(e) => updateShareLot(shareLots[0].id, { quantity: e.target.value })}
                    className={inputClass}
                    placeholder="e.g. 10"
                  />
                </Field>
                <Field label="Price / Unit" className="col-span-2 sm:col-span-1">
                  {isMarketSelectable ? (
                    <div className="flex gap-1">
                      <input
                        type="number"
                        step="any"
                        value={lotPriceRaw[shareLots[0].id] ?? shareLots[0].price}
                        onChange={(e) =>
                          setLotPriceRaw((m) => ({ ...m, [shareLots[0].id]: e.target.value }))
                        }
                        className={`${fieldBaseClass} flex-1 min-w-0 px-3`}
                        placeholder="e.g. 200"
                      />
                      <CustomSelect
                        value={lotPriceCurrency[shareLots[0].id] ?? currency}
                        onChange={(v) =>
                          handleLotPriceCurrencyChange(shareLots[0].id, v, shareLots[0].price)
                        }
                        className={`${fieldBaseClass} w-16 shrink-0 px-1.5`}
                        menuWidth={100}
                        options={[
                          { value: currency, label: currency },
                          { value: otherCurrency, label: otherCurrency },
                        ]}
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="any"
                      value={shareLots[0].price}
                      onChange={(e) => updateShareLot(shareLots[0].id, { price: e.target.value })}
                      className={inputClass}
                      placeholder="e.g. 200"
                    />
                  )}
                </Field>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <button
                  type="button"
                  onClick={addShareLot}
                  className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
                >
                  <Plus size={16} /> Add another purchase
                </button>
                {isMarketSelectable && (
                  <button
                    type="button"
                    onClick={() => setLotMode(shareLots[0].id, 'amount')}
                    className="text-sm text-brand-600 hover:text-brand-700 underline"
                  >
                    Paid in {otherCurrency}? Enter the amount instead
                  </button>
                )}
              </div>
            </>
          ) : (
          <div className="space-y-3 border border-line-soft bg-slate-50/60 rounded-xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm font-medium text-ink-2">Purchases</p>
              <p className="text-xs text-slate-500">
                Total: <span className="font-semibold text-brand-700">{totalShareQty || 0}</span>
                {' · Avg. Cost '}
                <span className="font-semibold text-brand-700">
                  {formatPreciseCurrency(weightedAvgCost, currency)}
                </span>
              </p>
            </div>
            <div className="space-y-2.5">
              {shareLots.map((lot, i) => {
                const mode = lotInputMode[lot.id] ?? 'qty';
                const amtCurrency = lotAmountCurrency[lot.id] ?? otherCurrency;
                const priceCurrency = lotPriceCurrency[lot.id] ?? currency;
                // A row only counts toward Quantity/Avg. Cost/Invested once
                // BOTH its "how much" field (Quantity, or Amount Invested in
                // amount mode) AND Price/Unit are filled in — see
                // totalShareQty above. Flag the common half-filled case
                // (e.g. typing a Price/Unit but leaving Quantity blank)
                // instead of just silently leaving the totals unchanged,
                // which otherwise looks like the app ignored what was typed.
                const qtyOrAmountRaw = mode === 'amount' ? lotAmount[lot.id] : lot.quantity;
                const priceRaw = isMarketSelectable ? (lotPriceRaw[lot.id] ?? lot.price) : lot.price;
                const qtyOrAmountFilled = Number(qtyOrAmountRaw) > 0;
                const priceFilled = Number(priceRaw) > 0;
                const lotIncomplete = qtyOrAmountFilled !== priceFilled;
                // Every purchase gets the collapse arrow now, even a lone
                // one — see the matching comment on the weight-tracked
                // (gold-style) purchases block above.
                const collapsible = true;
                const collapsed = collapsible && collapsedLotIds.has(lot.id);
                return (
                  <div
                    key={lot.id}
                    className="rounded-lg border border-slate-200 bg-white dark:bg-slate-800/60 dark:border-slate-700 p-3 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => collapsible && toggleLotCollapsed(lot.id)}
                        disabled={!collapsible}
                        className={`flex items-center gap-1.5 min-w-0 text-left ${collapsible ? 'cursor-pointer' : ''}`}
                      >
                        {collapsible && (
                          <ChevronDown
                            size={15}
                            className={`shrink-0 text-slate-400 transition-transform ${collapsed ? '-rotate-90' : ''}`}
                          />
                        )}
                        <span className="text-xs font-medium text-slate-600 shrink-0">Purchase {i + 1}</span>
                        {collapsed && (
                          <span className="text-xs text-slate-400 truncate">
                            {[
                              lot.date || null,
                              qtyOrAmountFilled && mode === 'qty' ? `${lot.quantity} shares` : null,
                              qtyOrAmountFilled && mode === 'amount' ? `${lotAmount[lot.id]} ${amtCurrency}` : null,
                              priceFilled ? `@ ${formatPreciseCurrency(Number(priceRaw), priceCurrency)}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || 'Not filled in yet'}
                          </span>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm('Remove this purchase entry?')) removeShareLot(lot.id);
                        }}
                        disabled={shareLots.length === 1}
                        className="h-7 w-7 shrink-0 flex items-center justify-center rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                        title="Remove this purchase"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                    {!collapsed && (
                    <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <Field label="Date">
                        <input
                          type="date"
                          value={lot.date ?? ''}
                          onChange={(e) => updateShareLot(lot.id, { date: e.target.value })}
                          className={`${inputClass} pr-2`}
                        />
                      </Field>
                      {mode === 'qty' ? (
                        <Field label="Quantity">
                          <input
                            type="number"
                            step="any"
                            value={lot.quantity}
                            onChange={(e) => updateShareLot(lot.id, { quantity: e.target.value })}
                            className={inputClass}
                            placeholder="e.g. 10"
                          />
                        </Field>
                      ) : (
                        <Field label="Amount Invested">
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="any"
                              value={lotAmount[lot.id] ?? ''}
                              onChange={(e) => setLotAmount((m) => ({ ...m, [lot.id]: e.target.value }))}
                              className={`${fieldBaseClass} flex-1 min-w-0 px-3`}
                              placeholder="e.g. 100"
                            />
                            <CustomSelect
                              value={amtCurrency}
                              onChange={(v) =>
                                setLotAmountCurrency((m) => ({ ...m, [lot.id]: v }))
                              }
                              className={`${fieldBaseClass} w-16 shrink-0 px-1.5`}
                              menuWidth={100}
                              options={[
                                { value: currency, label: currency },
                                { value: otherCurrency, label: otherCurrency },
                              ]}
                            />
                          </div>
                        </Field>
                      )}
                      <Field label="Price / Unit" className="col-span-2 sm:col-span-1">
                        {isMarketSelectable ? (
                          <div className="flex gap-1">
                            <input
                              type="number"
                              step="any"
                              value={lotPriceRaw[lot.id] ?? lot.price}
                              onChange={(e) => setLotPriceRaw((m) => ({ ...m, [lot.id]: e.target.value }))}
                              className={`${fieldBaseClass} flex-1 min-w-0 px-3`}
                              placeholder="e.g. 200"
                            />
                            <CustomSelect
                              value={lotPriceCurrency[lot.id] ?? currency}
                              onChange={(v) => handleLotPriceCurrencyChange(lot.id, v, lot.price)}
                              className={`${fieldBaseClass} w-20 shrink-0 px-1.5`}
                              menuWidth={100}
                              options={[
                                { value: currency, label: currency },
                                { value: otherCurrency, label: otherCurrency },
                              ]}
                            />
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="any"
                            value={lot.price}
                            onChange={(e) => updateShareLot(lot.id, { price: e.target.value })}
                            className={inputClass}
                            placeholder="e.g. 200"
                          />
                        )}
                      </Field>
                    </div>
                    {lotIncomplete && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 flex items-start gap-1">
                        <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                        {qtyOrAmountFilled
                          ? "Add a Price/Unit for this purchase — it won't count toward the total until both are filled in."
                          : mode === 'amount'
                            ? "Add an Amount Invested for this purchase — it won't count toward the total until both are filled in."
                            : "Add a Quantity for this purchase — it won't count toward the total until both are filled in."}
                      </p>
                    )}
                    {isMarketSelectable && (
                      <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                        {mode === 'qty' ? (
                          <button
                            type="button"
                            onClick={() => setLotMode(lot.id, 'amount')}
                            className="text-brand-600 hover:text-brand-700 underline"
                          >
                            Paid in {otherCurrency}? Enter the amount instead
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setLotMode(lot.id, 'qty')}
                              className="text-brand-600 hover:text-brand-700 underline"
                            >
                              Enter quantity instead
                            </button>
                            {amtCurrency !== currency && (
                              <span>
                                {fxLoading && !fxRate ? (
                                  <span className="flex items-center gap-1">
                                    <Loader2 size={11} className="animate-spin" /> Fetching {otherCurrency}/
                                    {currency} rate…
                                  </span>
                                ) : fxFailed && !fxRate ? (
                                  <span className="text-red-500">
                                    Couldn't fetch a live exchange rate — enter Quantity directly instead.
                                  </span>
                                ) : lot.quantity ? (
                                  <>
                                    ≈ <span className="font-medium text-slate-500">{lot.quantity}</span> shares
                                    at 1 {otherCurrency} ≈ {fxRate?.toFixed(4)} {currency}
                                  </>
                                ) : null}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {isMarketSelectable && priceCurrency !== currency && (
                      <div className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                        {fxLoading && !fxRate ? (
                          <span className="flex items-center gap-1">
                            <Loader2 size={11} className="animate-spin" /> Fetching {otherCurrency}/{currency}{' '}
                            rate…
                          </span>
                        ) : fxFailed && !fxRate ? (
                          <span className="text-red-500">
                            Couldn't fetch a live exchange rate — enter the price in {currency} directly instead.
                          </span>
                        ) : lot.price ? (
                          <>
                            Price/Unit ≈{' '}
                            <span className="font-medium text-slate-500">
                              {formatPreciseCurrency(Number(lot.price), currency)}
                            </span>{' '}
                            at 1 {otherCurrency} ≈ {fxRate?.toFixed(4)} {currency}
                          </>
                        ) : null}
                      </div>
                    )}
                    </>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={addShareLot}
              className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
            >
              <Plus size={16} /> Add another purchase
            </button>
            <p className="text-xs text-slate-600">
              Bought more later at a different price? Come back to Edit and add another purchase row —
              quantity and average cost update automatically, and returns recalculate off the new average.
            </p>
          </div>
          )}
        </>
      )}
      {isRecurringEligible && (
        <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
          <label className="flex items-center gap-2 text-sm font-medium text-ink-2 cursor-pointer">
            <input
              type="checkbox"
              checked={recurringInvestment}
              onChange={(e) => setRecurringInvestment(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Set up as a recurring investment (SIP)
          </label>
          {recurringInvestment && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="SIP Amount (per installment)">
                  <input
                    type="number"
                    step="any"
                    value={sipAmount}
                    onChange={(e) => setSipAmount(e.target.value)}
                    className={inputClass}
                    placeholder="e.g. 10000"
                  />
                </Field>
                <Field label="Frequency">
                  <CustomSelect
                    value={sipFrequency}
                    onChange={(v) => setSipFrequency(v as 'monthly' | 'quarterly')}
                    className={inputClass}
                    options={[
                      { value: 'monthly', label: 'Monthly' },
                      { value: 'quarterly', label: 'Quarterly' },
                    ]}
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
              {stockSipProgress && (
                <p className="text-xs text-slate-500">
                  {stockSipProgress.installmentsElapsed > 0
                    ? `${stockSipProgress.installmentsElapsed} installment${stockSipProgress.installmentsElapsed === 1 ? '' : 's'} due since start`
                    : 'No installments due yet'}
                  {stockSipProgress.nextInstallmentDate && ` · Next due ${stockSipProgress.nextInstallmentDate}`}
                </p>
              )}
              <p className="text-xs text-slate-600">
                This just tracks your plan and reminds you when the next installment is due — log
                each actual purchase under "Purchases" below once you invest, so quantity and
                average cost stay accurate.
              </p>
            </>
          )}
        </div>
      )}
      {isUnitTracked && (
        <Field label="Held in account">
          <CustomSelect
            value={institution}
            onChange={setInstitution}
            className={`${inputClass} bg-white text-ink-2`}
            placeholder="None"
            options={[
              { value: '', label: 'None' },
              ...COMMON_BROKERS.map((b) => ({ value: b, label: b })),
              ...(institution && !COMMON_BROKERS.includes(institution)
                ? [{ value: institution, label: institution }]
                : []),
            ]}
          />
        </Field>
      )}
      {SIP_CLASSES.has(assetClass) && (
        <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
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
                  className="animate-spin text-slate-600 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
              {!fundSearchLoading && fundIsLinked && (
                <CheckCircle2
                  size={16}
                  className="text-emerald-500 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
              {fundSearchOpen && fundSuggestions.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto bg-surface border border-line rounded-lg shadow-lg">
                  {fundSuggestions.map((f) => (
                    <button
                      key={f.schemeCode}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => selectFund(f)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-brand-50 border-b border-line-soft last:border-0"
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
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-line rounded-lg shadow-lg px-3 py-2 text-sm">
                    {fundSearchFailed ? (
                      <span className="text-red-500">
                        Couldn't reach the fund search — check your connection, or restart the dev
                        server if you just updated the app.
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        No funds matched "{fundSearchedQuery}". Try the AMC name alone, e.g. "HDFC".
                      </span>
                    )}
                  </div>
                )}
            </div>
            {fundIsLinked ? (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                Linked to {matchedFundName ?? 'this fund'} — Current Value updates automatically.{' '}
                <button type="button" onClick={unlinkFund} className="text-slate-600 hover:text-slate-600 underline">
                  unlink
                </button>
              </p>
            ) : (
              <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
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
              <CustomSelect
                value={sipFrequency}
                onChange={(v) => setSipFrequency(v as 'monthly' | 'quarterly')}
                className={inputClass}
                options={[
                  { value: 'monthly', label: 'Monthly' },
                  { value: 'quarterly', label: 'Quarterly' },
                ]}
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
        <div className="space-y-4 border border-line-soft bg-slate-50/60 rounded-xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bank / Institution">
              <input
                value={institution}
                onChange={(e) => setInstitution(e.target.value.toUpperCase())}
                className={`${inputClass}`}
                placeholder="e.g. HDFC Bank"
              />
            </Field>
            <Field label="Interest Rate (%)">
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
        <Field label={isSip ? 'Current Value (auto)' : (DEPOSIT_LIKE_CLASSES.has(assetClass) ? 'Maturity Amount (auto)' : 'Current Value')}>
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
                  className="animate-spin text-slate-600 absolute right-3 top-1/2 -translate-y-1/2"
                />
              )}
            </div>
          ) : DEPOSIT_LIKE_CLASSES.has(assetClass) ? (
            <div className="relative">
              <input
                type="text"
                readOnly
                value={
                  estimatedMaturityValue
                    ? formatPreciseCurrency(estimatedMaturityValue, currency)
                    : '—'
                }
                className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
              />
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
            <p className="text-xs text-slate-600 mt-1">
              Defaults to total amount paid ({formatPreciseCurrency(totalPurchaseAmount, currency)}) — edit if today's market value is different.
            </p>
          )}
          {isUnitTracked && !symbol.trim() && (
            <p className="text-xs text-slate-600 mt-1">
              Add a Symbol above for a live price, or enter today's value here manually.
            </p>
          )}
          {isSip && fundIsLinked && !liveValueLoading && !liveValueError && (
            <p className="text-xs text-slate-600 mt-1">Calculated from the fund's live NAV × units bought each installment.</p>
          )}
          {isSip && !fundIsLinked && !liveValueLoading && (
            <p className="text-xs text-slate-600 mt-1">Link a fund above for a live value — using amount invested so far for now.</p>
          )}
          {isSip && liveValueError && (
            <p className={errorTextClass}>Couldn't fetch this fund's live NAV — using amount invested so far instead.</p>
          )}
          {isEquityLive && equityLiveLoading && (
            <p className="text-xs text-slate-600 mt-1 flex items-center gap-1">
              <Loader2 size={12} className="animate-spin" /> Fetching live price for "{symbol.trim()}"…
            </p>
          )}
          {isEquityLive && !equityLiveLoading && equityLivePrice !== null && (
            <p className="text-xs text-slate-600 mt-1">
              Live price {formatPreciseCurrency(equityLivePrice, currency)} × {quantity || 0} — updates
              automatically; edit this field to override.
            </p>
          )}
          {isEquityLive && !equityLiveLoading && equityLiveError && (
            <p className={errorTextClass}>
              Couldn't fetch a live price for "{symbol.trim()}" — enter the current value manually.
            </p>
          )}
          {DEPOSIT_LIKE_CLASSES.has(assetClass) && (
            <p className="text-xs text-slate-600 mt-1">Auto-calculated using quarterly compound interest formula</p>
          )}
          {!isSip && !DEPOSIT_LIKE_CLASSES.has(assetClass) && attemptedSubmit && valueMissing && <p className={errorTextClass}>Current Value is required.</p>}
        </Field>
        <Field
          label={
            SIP_CLASSES.has(assetClass)
              ? 'Initial Investment Amount'
              : DEPOSIT_LIKE_CLASSES.has(assetClass)
                ? 'Invested Amount'
              : isWeightTracked || isUnitTracked
                ? 'Invested (auto, from purchases)'
                : 'Invested (optional)'
          }
        >
          <input
            type="number"
            step="any"
            value={DEPOSIT_LIKE_CLASSES.has(assetClass) ? value : investedValue}
            readOnly={isWeightTracked || isUnitTracked}
            onChange={(e) => {
              if (DEPOSIT_LIKE_CLASSES.has(assetClass)) {
                valueTouchedRef.current = true;
                setValue(e.target.value);
              } else if (!isWeightTracked && !isUnitTracked) {
                setInvestedValue(e.target.value);
              }
            }}
            className={`${inputClass} ${(isWeightTracked || isUnitTracked) && !DEPOSIT_LIKE_CLASSES.has(assetClass) ? 'bg-slate-50 text-slate-600 cursor-not-allowed' : ''}`}
            placeholder={SIP_CLASSES.has(assetClass) ? '0' : DEPOSIT_LIKE_CLASSES.has(assetClass) ? '0' : 'Auto: Qty × Avg'}
          />
          {DEPOSIT_LIKE_CLASSES.has(assetClass) && (
            <p className="text-xs text-slate-600 mt-1">Principal/Initial deposit amount</p>
          )}
        </Field>
      </div>
      <button
        type="button"
        onClick={() => setShowMoreDetails((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
      >
        {showMoreDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        {showMoreDetails ? 'Hide details' : 'Show details'}
      </button>
      {showMoreDetails && (
        <div className="space-y-4 border-t border-line-soft pt-4">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Geography">
              <CustomSelect
                value={geography}
                onChange={setGeography}
                className={`${inputClass} bg-white text-ink-2`}
                placeholder="—"
                options={GEOGRAPHY_OPTIONS.map((g) => ({ value: g.value as string, label: g.label }))}
              />
            </Field>
            <Field label="Sub-class">
              <input
                value={subClass}
                onChange={(e) => setSubClass(e.target.value)}
                className={inputClass}
                placeholder="e.g. Large Cap, SGB..."
              />
            </Field>
          </div>
          <Field label="Tags">
            <div className="min-h-[38px] flex flex-wrap gap-1.5 items-center px-2.5 py-1.5 rounded-lg border border-line bg-surface focus-within:ring-2 focus-within:ring-brand-500">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 text-ink-2 text-xs font-medium px-2 py-1 rounded-md"
                >
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <input
                value={tagDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.endsWith(',')) addTag(v.slice(0, -1));
                  else setTagDraft(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagDraft);
                  } else if (e.key === 'Backspace' && !tagDraft && tags.length) {
                    setTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => tagDraft && addTag(tagDraft)}
                className="flex-1 min-w-[90px] bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="e.g. long-term, swing-trade, tech…"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Press Enter or comma to add · spaces become hyphens</p>
          </Field>
          <Field label="Notes">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
              placeholder="Optional notes..."
            />
          </Field>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={excludeFromAllocation}
              onChange={(e) => setExcludeFromAllocation(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <EyeOff size={14} className="text-slate-500" /> Exclude from allocation
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Still counts toward net worth, but ignored in allocation % and recommendations
              </p>
            </div>
          </label>
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={emergencyFund}
              onChange={(e) => setEmergencyFund(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-ink">
                <AlertTriangle size={14} className="text-slate-500" /> Part of emergency fund
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Tag the holdings you actually earmark for emergencies.
              </p>
            </div>
          </label>
        </div>
      )}
      {attemptedSubmit && hasErrors && (
        <p className="text-sm text-red-600 text-center">
          Please fill in the highlighted field{nameMissing && valueMissing ? 's' : ''} before saving.
        </p>
      )}
      {onClose ? (
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-ink-2 py-2.5 rounded-lg text-base font-medium"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white"
          >
            Save
          </button>
        </div>
      ) : (
        <button onClick={submit} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white">
          Save Asset
        </button>
      )}
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
  useModalBackClose(modalOpen, () => setModalOpen(false));
  const [pendingDelete, setPendingDelete] = useState<Liability | null>(null);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user, 'liabilities', id);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await handleDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  const handleSave = async (liability: Liability) => {
    if (!user) return;
    try {
      await upsertDoc(user, 'liabilities', liability);
      setModalOpen(false);
    } catch (err) {
      console.error('Failed to save liability', err);
      alert('Could not save this liability. Please check your connection and try again.');
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Liabilities"
        description={
          <>
            {liabilities.length} active · {formatPreciseCurrency(liabilities.reduce((s, l) => s + l.outstanding, 0))} outstanding
          </>
        }
        actions={
          <Button onClick={onAdd} leftIcon={<Plus size={16} />} className="w-full sm:w-auto">
            Add liability
          </Button>
        }
      />

      <TabNav tab={tab} setTab={setTab} />

      <Card padding="none" className="overflow-hidden">
        {liabilities.length === 0 ? (
          <EmptyState
            icon={<Banknote size={18} />}
            title="No liabilities tracked"
            description="Add loans or credit lines to see your true net worth."
            action={
              <Button onClick={onAdd} leftIcon={<Plus size={16} />}>
                Add liability
              </Button>
            }
          />
        ) : (
          <TableContainer>
            <Table className="min-w-[720px]">
              <THead>
                <tr>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th align="right">Outstanding</Th>
                  <Th align="right">EMI</Th>
                  <th className="w-24" aria-hidden="true" />
                </tr>
              </THead>
              <TBody>
                {liabilities.map((l) => (
                  <tr key={l.id} className="border-b border-line-soft last:border-b-0 transition-colors hover:bg-surface-hover/70">
                    <Td className="font-medium">{l.name}</Td>
                    <Td className="text-muted">{l.liabilityClass ? LIABILITY_CLASS_LABELS[l.liabilityClass] : '—'}</Td>
                    <Td numeric>{formatPreciseCurrency(l.outstanding, l.currency)}</Td>
                    <Td numeric className="text-muted font-normal">
                      {l.emi ? formatPreciseCurrency(l.emi, l.currency) : '—'}
                    </Td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-end">
                        <IconButton
                          label="Edit liability"
                          size="sm"
                          onClick={() => {
                            setEditing(l);
                            setModalOpen(true);
                          }}
                        >
                          <Pencil size={15} />
                        </IconButton>
                        <IconButton
                          label="Delete liability"
                          size="sm"
                          onClick={() => setPendingDelete(l)}
                          className="hover:!text-negative hover:!bg-negative-soft"
                        >
                          <Trash2 size={15} />
                        </IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </TableContainer>
        )}
      </Card>

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
        <input
          value={name}
          onChange={(e) => setName(e.target.value.toUpperCase())}
          className={`${inputClass}`}
          placeholder="e.g. Home Loan"
        />
      </Field>
      {effectiveCategory && effectiveCategory.types.length > 1 ? (
        <Field label={`${effectiveCategory.label} Type`}>
          <CustomSelect
            value={liabilityClass}
            onChange={(v) => setLiabilityClass(v as LiabilityClass)}
            className={inputClass}
            options={effectiveCategory.types.map((t) => ({ value: t.value, label: t.label }))}
          />
        </Field>
      ) : (
        <Field label="Liability Type">
          <p className="text-sm font-medium text-ink-2 border border-line rounded-lg px-3 py-2.5 bg-slate-50">
            {LIABILITY_CLASS_LABELS[liabilityClass]}
          </p>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Outstanding">
          <input type="number" value={outstanding} onChange={(e) => setOutstanding(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} className={inputClass} />
        </Field>
      </div>
      <Field label="Monthly EMI (optional)">
        <input type="number" value={emi} onChange={(e) => setEmi(e.target.value)} className={inputClass} placeholder="0" />
      </Field>
      <button onClick={submit} className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white">
        Save Liability
      </button>
    </div>
  );
}

function NetWorthTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const assetsServerConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  const liabilitiesServerConfirmed = useSyncStatusStore((s) => s.liabilitiesServerConfirmed);
  // Same reasoning as Dashboard.tsx's wealthDataKnown: trust a `0` total
  // only once we know it's real (already have items, or the server has
  // actually confirmed both collections) rather than just an offline cache
  // that hasn't loaded yet — otherwise this briefly flashes ₹0 for
  // everyone on first paint, worse on a slower mobile connection.
  const wealthDataKnown =
    assets.length > 0 || liabilities.length > 0 || (assetsServerConfirmed && liabilitiesServerConfirmed);

  const totalAssets = assets.reduce((s, a) => s + a.value, 0);
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  return (
    <div className="space-y-4">
      <PageHeader title="Net worth" description="Everything you own and owe, in one view." />

      <TabNav tab={tab} setTab={setTab} />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <SummaryCard
          label="Assets"
          value={maskPreciseAmount(totalAssets, 'INR', privacyMode)}
          tone="brand"
          loading={!wealthDataKnown}
        />
        <SummaryCard
          label="Liabilities"
          value={maskPreciseAmount(totalLiabilities, 'INR', privacyMode)}
          tone="red"
          loading={!wealthDataKnown}
        />
        <SummaryCard
          label="Net worth"
          value={maskPreciseAmount(netWorth, 'INR', privacyMode)}
          tone="slate"
          loading={!wealthDataKnown}
        />
      </div>
    </div>
  );
}

function AllocationTab({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const assets = useAssetsStore((s) => s.assets);
  const byClass: Record<string, number> = {};
  assets.forEach((a) => {
    if (a.excludeFromAllocation) return;
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
      <PageHeader title="Allocation" description="How your wealth is spread across asset classes." />

      <TabNav tab={tab} setTab={setTab} />

      {data.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<BarChart2 size={18} />}
            title="Nothing to allocate yet"
            description="Add assets to see how your wealth is spread out."
          />
        </Card>
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
  const sorted = [...data].sort((a, b) => b.value - a.value);
  return (
    <Card padding="lg" className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
      <div className="relative">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={sorted}
              dataKey="value"
              nameKey="name"
              innerRadius={68}
              outerRadius={104}
              paddingAngle={2}
              stroke="none"
              isAnimationActive={false}
            >
              {sorted.map((entry) => (
                <Cell key={entry.name} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v) => formatPreciseCurrency(Number(v))}
              contentStyle={chart.tooltip.contentStyle}
              labelStyle={chart.tooltip.labelStyle}
              itemStyle={chart.tooltip.itemStyle}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xs text-muted">Total</span>
          <span className="font-numeric text-base font-semibold text-ink">{formatPreciseCurrency(total)}</span>
        </div>
      </div>
      <ul className="divide-y divide-line-soft">
        {sorted.map((d) => (
          <li key={d.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ backgroundColor: d.color }} />
              <span className="text-ink-2 font-medium truncate">{d.name}</span>
            </div>
            <div className="text-right shrink-0 font-numeric">
              <span className="text-ink font-semibold">{formatPreciseCurrency(d.value)}</span>
              <span className="text-muted font-normal ml-2 inline-block w-12">
                {total > 0 ? ((d.value / total) * 100).toFixed(1) : '0.0'}%
              </span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      {/* min-h + items-end reserves space for a 2-line label and bottom-aligns
         the text, so when a field sits next to a shorter label in a grid row
         (e.g. "Interest Rate (%)" beside "Bank / Institution"), both inputs
         still start at the same y position instead of one sitting lower. */}
      <span className="text-sm font-medium text-slate-500 mb-1 flex items-end min-h-[2.25rem] leading-snug">
        {label}
      </span>
      {children}
    </label>
  );
}

const inputClass = inputClasses;

// Same visual styling as inputClass but WITHOUT the `w-full`, so it's safe to
// pair with flex-basis utilities (flex-1, w-14, etc.) inside a flex row.
// Reusing inputClass there caused a Tailwind cascade bug: `w-full` and `w-14`
// have equal specificity, and Tailwind's generated stylesheet order (not the
// order classes are listed in JSX) decided which one won — so the currency
// <select> kept rendering at full width and crushed the number input next to it.
const fieldBaseClass = `min-h-10 sm:min-h-9 py-1.5 ${fieldBase}`;

const errorInputClass = 'border-red-400 focus:ring-red-400';
const errorTextClass = 'text-xs text-red-500 mt-1';
