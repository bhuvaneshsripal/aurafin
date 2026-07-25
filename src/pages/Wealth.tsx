import { useState, useEffect, useRef } from 'react';
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
  X,
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
import { upsertDoc, removeDoc } from '../hooks/useFirestoreSync';
import { exportToCsv } from '../utils/exportCsv';
import Modal from '../components/Modal';
import type { Asset, AssetClass, Liability, LiabilityClass } from '../types';
import { CURRENCIES, formatPreciseCurrency } from '../utils/currency';
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
  type CategoryDef,
} from '../utils/taxonomy';
import { resolveAssetValues } from '../utils/assetValues';

type Tab = 'assets' | 'liabilities' | 'networth' | 'allocation';
type SortKey = 'name' | 'qty' | 'avgCost' | 'perUnit' | 'invested' | 'value' | 'pnl' | 'alloc';
type EntryType = 'asset' | 'liability';

export default function Wealth() {
  const [tab, setTab] = useState<Tab>('assets');
  const [addFlow, setAddFlow] = useState<EntryType | null>(null);

  if (addFlow) {
    return <AddWealthPage initialEntryType={addFlow} onClose={() => setAddFlow(null)} />;
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
  onClose,
}: {
  initialEntryType: EntryType;
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [entryType, setEntryType] = useState<EntryType>(initialEntryType);
  const [step, setStep] = useState<'category' | 'details'>('category');
  const [categoryKey, setCategoryKey] = useState<string | undefined>();
  const [pickedType, setPickedType] = useState<string | undefined>();

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
    await upsertDoc(user.uid, 'assets', asset);
    onClose();
  };

  const handleSaveLiability = async (liability: Liability) => {
    if (!user) return;
    await upsertDoc(user.uid, 'liabilities', liability);
    onClose();
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
    <div className="flex gap-2 border-b border-slate-200">
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
          className={`px-4 py-2.5 text-base font-medium border-b-2 -mb-px transition-colors ${
            tab === key
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-700'
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
    <div className="relative flex-1 min-w-[180px]" ref={ref}>
      <span className="text-xs font-medium text-slate-500 mb-1 block">{label}</span>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full min-h-[42px] flex items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-left"
      >
        <div className="flex items-center gap-1.5 flex-wrap flex-1">
          {selected.length === 0 ? (
            <span className="text-slate-400 text-sm">{placeholder}</span>
          ) : (
            selected.map((v) => {
              const opt = options.find((o) => o.value === v);
              return (
                <span
                  key={v}
                  className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 text-xs font-medium pl-2 pr-1 py-1 rounded-md"
                >
                  {opt?.label ?? v}
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleOption(v);
                    }}
                    className="hover:bg-slate-200 rounded-sm p-0.5"
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
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <p className="text-xs font-semibold tracking-wide text-slate-400 mb-5">{title}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">INVESTED</p>
          <p className="text-2xl font-bold text-slate-900">
            {privacyMode ? '••••••' : formatPreciseCurrency(invested, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">CURRENT VALUE</p>
          <p className="text-2xl font-bold text-slate-900">
            {privacyMode ? '••••••' : formatPreciseCurrency(currentValue, currency)}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">P&L</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-2xl font-bold ${positive ? 'text-brand-600' : 'text-red-500'}`}>
              {privacyMode ? '••••••' : `${positive ? '+' : ''}${formatPreciseCurrency(pnl, currency)}`}
            </span>
            {!privacyMode && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  positive ? 'bg-brand-50 text-brand-600' : 'bg-red-50 text-red-500'
                }`}
              >
                {positive ? '+' : ''}
                {pnlPercent.toFixed(1)}%
              </span>
            )}
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
  const assets = useAssetsStore((s) => s.assets);
  const livePrices = useLivePricesStore((s) => s.prices);
  const user = useAuthStore((s) => s.user);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [sortKey, setSortKey] = useState<SortKey>('value');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedCurrencies, setSelectedCurrencies] = useState<string[]>([]);

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
    await upsertDoc(user.uid, 'assets', asset);
    setModalOpen(false);
  };

  const handleExport = () => {
    exportToCsv(
      'assets',
      assets.map((a) => {
        const { invested, currentPrice, value, pnl, pnlPercent } = resolveAssetValues(a, livePrices);
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

  const filtered = assets.filter((a) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q || a.name.toLowerCase().includes(q) || (a.symbol ?? '').toLowerCase().includes(q);
    const category = ASSET_CLASS_TO_CATEGORY[a.assetClass];
    const matchesCategory =
      selectedCategories.length === 0 || (category && selectedCategories.includes(category.key));
    const matchesCurrency = selectedCurrencies.length === 0 || selectedCurrencies.includes(a.currency);
    return matchesSearch && matchesCategory && matchesCurrency;
  });

  const totalValue = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices).value, 0);

  const rows = filtered.map((a) => {
    const computed = resolveAssetValues(a, livePrices);
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

  const currencyOptions = Array.from(new Set(assets.map((a) => a.currency))).map((c) => ({
    value: c,
    label: c,
  }));

  const sortedRows = [...rows].sort((a, b) => {
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
          <h2 className="text-2xl font-bold text-slate-900">Assets</h2>
          <p className="text-slate-500 text-sm mt-0.5">{assets.length} assets</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search..."
              className="pl-9 pr-3 py-2 border-2 border-slate-300 rounded-lg text-sm w-40 sm:w-48 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
            />
          </div>
          <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`h-9 w-9 flex items-center justify-center ${
                viewMode === 'grid' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`h-9 w-9 flex items-center justify-center border-l border-slate-200 ${
                viewMode === 'list' ? 'bg-slate-100 text-slate-800' : 'text-slate-400 hover:bg-slate-50'
              }`}
            >
              <ListIcon size={16} />
            </button>
          </div>
          <button
            onClick={handleExport}
            disabled={assets.length === 0}
            title="Export CSV"
            className="h-9 w-9 flex items-center justify-center border border-slate-200 hover:bg-slate-50 disabled:opacity-40 text-slate-500 rounded-lg"
          >
            <Download size={16} />
          </button>
          <button
            onClick={onAdd}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
          >
            <Plus size={18} /> Add Asset
          </button>
        </div>
      </div>

      <TabNav tab={tab} setTab={setTab} />

      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        <FilterDropdown
          label="Filter"
          placeholder="Filter by category"
          options={categoryOptions}
          selected={selectedCategories}
          onChange={setSelectedCategories}
        />
        <FilterDropdown
          label="Tags"
          placeholder="Filter by tag"
          options={[]}
          selected={[]}
          onChange={() => {}}
        />
        <FilterDropdown
          label="Currency"
          placeholder="Filter by currency"
          options={currencyOptions}
          selected={selectedCurrencies}
          onChange={setSelectedCurrencies}
        />
        <button
          onClick={() => toggleSort(sortKey)}
          title="Flip sort direction"
          className="h-[42px] w-[42px] shrink-0 flex items-center justify-center border border-slate-200 rounded-lg text-slate-500 hover:bg-slate-50"
        >
          <ArrowUpDown size={16} />
        </button>
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
        <div className="bg-white rounded-2xl border border-slate-200 px-4 py-10 text-center text-slate-400">
          {assets.length === 0 ? 'No assets yet. Add your first one to get started.' : 'No assets match your search.'}
        </div>
      )}

      {filtered.length > 0 && viewMode === 'list' ? (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                </th>
                <SortHeader label="NAME" sortKeyName="name" />
                <SortHeader label="QTY" sortKeyName="qty" align="right" />
                <SortHeader label="AVG. COST" sortKeyName="avgCost" align="right" />
                <SortHeader label="PER UNIT" sortKeyName="perUnit" align="right" />
                <SortHeader label="INVESTED" sortKeyName="invested" align="right" />
                <SortHeader label="CUR. VAL" sortKeyName="value" align="right" />
                <SortHeader label="P&L" sortKeyName="pnl" align="right" />
                <SortHeader label="% ALLOC" sortKeyName="alloc" align="right" />
                <th className="px-4 py-3 w-28"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRows.map(({ asset: a, invested, currentPrice, value, pnl, pnlPercent, alloc }) => (
                <tr key={a.id} className="group hover:bg-slate-50/60">
                  <td className="px-4 py-3.5">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" />
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-slate-800">{a.name}</p>
                    <p className="text-xs text-slate-400">
                      {ASSET_CLASS_LABELS[a.assetClass]}
                      {a.institution ? ` · ${a.institution}` : ''}
                      {a.interestRate ? ` · ${a.interestRate}% p.a.` : ''}
                      {a.maturityDate ? ` · Matures ${a.maturityDate}` : ''}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-right text-slate-600">{a.quantity ?? '—'}</td>
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
                    {privacyMode ? '••••••' : formatPreciseCurrency(value, a.currency)}
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
                    <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleDuplicate(a)}
                        title="Duplicate"
                        className="text-slate-400 hover:text-brand-600 p-1"
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        onClick={() => openEdit(a)}
                        title="Edit"
                        className="text-slate-400 hover:text-brand-600 p-1"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        onClick={() => handleDelete(a.id)}
                        title="Delete"
                        className="text-slate-400 hover:text-red-500 p-1"
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
      ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => {
              const { value, pnl, pnlPercent } = resolveAssetValues(a, livePrices);
              return (
                <div key={a.id} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <p className="font-semibold text-slate-800">{a.name}</p>
                  <p className="text-xs text-slate-400 mb-2">
                    {ASSET_CLASS_LABELS[a.assetClass]}
                    {a.institution ? ` · ${a.institution}` : ''}
                    {a.interestRate ? ` · ${a.interestRate}% p.a.` : ''}
                    {a.maturityDate ? ` · Matures ${a.maturityDate}` : ''}
                  </p>
                  <p className="text-lg font-semibold text-slate-900">
                    {privacyMode ? '••••••' : formatPreciseCurrency(value, a.currency)}
                  </p>
                  {pnlPercent !== undefined && (
                    <p className={`text-xs font-medium ${pnl! >= 0 ? 'text-brand-600' : 'text-red-500'}`}>
                      {pnl! >= 0 ? '+' : ''}
                      {pnlPercent.toFixed(1)}%
                    </p>
                  )}
                  <div className="flex items-center gap-3 mt-3">
                    <button onClick={() => openEdit(a)} className="text-slate-400 hover:text-brand-600">
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
      ) : null}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Asset">
        {editing && <AssetDetailsForm initial={editing} onSave={handleSave} />}
      </Modal>
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
  const [maturityDate, setMaturityDate] = useState(initial?.maturityDate ?? '');
  const [monthlyInstallment, setMonthlyInstallment] = useState(
    initial?.monthlyInstallment?.toString() ?? ''
  );

  const principalForEstimate = investedValue ? Number(investedValue) : Number(value) || 0;
  const rateForEstimate = interestRate ? Number(interestRate) : 0;
  const yearsToMaturity = maturityDate
    ? (new Date(maturityDate).getTime() - Date.now()) / (365.25 * 24 * 60 * 60 * 1000)
    : 0;
  const estimatedMaturityValue =
    DEPOSIT_LIKE_CLASSES.has(assetClass) && principalForEstimate > 0 && rateForEstimate > 0 && yearsToMaturity > 0
      ? principalForEstimate * (1 + (rateForEstimate / 100) * yearsToMaturity)
      : undefined;

  const submit = () => {
    if (!name || !value) return;
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
      maturityDate: maturityDate || undefined,
      monthlyInstallment: monthlyInstallment ? Number(monthlyInstallment) : undefined,
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
          <ArrowLeft size={16} /> Back to asset type
        </button>
      )}
      <Field label="Name">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="e.g. HDFC Flexicap SIP" />
      </Field>
      {effectiveCategory && effectiveCategory.types.length > 1 ? (
        <Field label={`${effectiveCategory.label} Type`}>
          <select value={assetClass} onChange={(e) => setAssetClass(e.target.value as AssetClass)} className={inputClass}>
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
            {ASSET_CLASS_LABELS[assetClass]}
          </p>
        </Field>
      )}
      {SYMBOL_ENABLED_CLASSES.has(assetClass) && (
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
            <Field label="Maturity Date">
              <input
                type="date"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
                className={inputClass}
              />
            </Field>
            {RECURRING_DEPOSIT_CLASSES.has(assetClass) && (
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
            )}
          </div>
          {estimatedMaturityValue !== undefined && (
            <p className="text-xs text-slate-500">
              Est. maturity value:{' '}
              <span className="font-semibold text-brand-700">
                {formatPreciseCurrency(estimatedMaturityValue, currency)}
              </span>{' '}
              (simple-interest estimate based on rate and maturity date — actual payout may vary)
            </p>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Current Value">
          <input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Invested (optional)">
          <input type="number" step="any" value={investedValue} onChange={(e) => setInvestedValue(e.target.value)} className={inputClass} placeholder="Auto: Qty × Avg" />
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
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const user = useAuthStore((s) => s.user);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Liability | null>(null);

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user.uid, 'liabilities', id);
  };

  const handleSave = async (liability: Liability) => {
    if (!user) return;
    await upsertDoc(user.uid, 'liabilities', liability);
    setModalOpen(false);
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
          className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-base font-medium"
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
                    <button onClick={() => handleDelete(l.id)} className="text-slate-400 hover:text-red-500">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {liabilities.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400">
                  No liabilities tracked. Add loans or credit lines here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Liability">
        {editing && <LiabilityDetailsForm initial={editing} onSave={handleSave} />}
      </Modal>
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
          value={privacyMode ? '••••••' : formatPreciseCurrency(totalAssets)}
          tone="brand"
        />
        <SummaryCard
          label="Liabilities"
          value={privacyMode ? '••••••' : formatPreciseCurrency(totalLiabilities)}
          tone="red"
        />
        <SummaryCard
          label="Net Worth"
          value={privacyMode ? '••••••' : formatPreciseCurrency(netWorth)}
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
