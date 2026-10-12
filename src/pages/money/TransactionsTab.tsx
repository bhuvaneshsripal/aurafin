import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Plus,
  Trash2,
  Download,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowDownCircle,
  ArrowUpCircle,
  Receipt,
  Search,
  Pencil,
  Copy,
  X,
  ArrowUpDown,
} from 'lucide-react';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAuthStore } from '../../store/authStore';
import { useHouseholdProfilesStore } from '../../store/householdProfilesStore';
import { useSyncStatusStore } from '../../store/syncStatusStore';
import { upsertDoc, removeDoc } from '../../hooks/useFirestoreSync';
import { exportToCsv, exportToXlsx } from '../../utils/exportCsv';
import { formatDate, toIsoDate } from '../../utils/date';
import Modal from '../../components/Modal';
import ConfirmDeleteModal from '../../components/ConfirmDeleteModal';
import Amount from '../../components/Amount';
import type { Transaction, TransactionType } from '../../types';
import CurrencySelect from '../../components/CurrencySelect';
import CustomSelect from '../../components/CustomSelect';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  StatCard,
  cn,
  inputClasses,
  DateInput,
} from '../../components/ui';

// ---------------------------------------------------------------- periods --

type Period = 'month' | '3m' | '6m' | 'fy' | 'all' | 'custom';
const PERIODS: { key: Period; label: string }[] = [
  { key: 'month', label: 'Month' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: 'fy', label: 'FY' },
  { key: 'all', label: 'All' },
  { key: 'custom', label: 'Custom' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const monthOf = (iso: string) => iso.slice(0, 7);
const shiftMonth = (ym: string, n: number) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
};
const monthStart = (ym: string) => `${ym}-01`;
const monthEnd = (ym: string) => {
  const d = new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0);
  return `${ym}-${pad(d.getDate())}`;
};
const monthLabel = (ym: string) =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

interface Range {
  from?: string;
  to?: string;
}

/** Date range for a period, plus the equally-long range just before it (for "vs previous"). */
function rangesFor(period: Period, anchor: string, customFrom: string, customTo: string): { cur: Range; prev?: Range; label: string } {
  const thisMonth = monthOf(toIsoDate());
  if (period === 'month') {
    return {
      cur: { from: monthStart(anchor), to: monthEnd(anchor) },
      prev: { from: monthStart(shiftMonth(anchor, -1)), to: monthEnd(shiftMonth(anchor, -1)) },
      label: monthLabel(anchor),
    };
  }
  if (period === '3m' || period === '6m') {
    const n = period === '3m' ? 3 : 6;
    const start = shiftMonth(thisMonth, -(n - 1));
    return {
      cur: { from: monthStart(start), to: monthEnd(thisMonth) },
      prev: { from: monthStart(shiftMonth(start, -n)), to: monthEnd(shiftMonth(start, -1)) },
      label: `Last ${n} months`,
    };
  }
  if (period === 'fy') {
    const y = Number(thisMonth.slice(0, 4));
    const m = Number(thisMonth.slice(5, 7));
    const startY = m >= 4 ? y : y - 1;
    return {
      cur: { from: `${startY}-04-01`, to: `${startY + 1}-03-31` },
      prev: { from: `${startY - 1}-04-01`, to: `${startY}-03-31` },
      label: `FY ${startY}-${String((startY + 1) % 100).padStart(2, '0')}`,
    };
  }
  if (period === 'custom') {
    return { cur: { from: customFrom || undefined, to: customTo || undefined }, label: 'Custom range' };
  }
  return { cur: {}, label: 'All time' };
}

const inRange = (iso: string, r: Range) => (!r.from || iso >= r.from) && (!r.to || iso <= r.to);

// ------------------------------------------------------------- categories --

const EXPENSE_PRESETS = ['Groceries', 'Food & Dining', 'Rent', 'Transport', 'Utilities', 'Shopping', 'Healthcare', 'Entertainment', 'Education', 'EMI & Loans', 'Travel', 'Personal'];
const INCOME_PRESETS = ['Salary', 'Business', 'Interest', 'Dividend', 'Rental', 'Bonus', 'Refund', 'Investments'];

const catKey = (c: string) => c.trim().toLowerCase();

function dayHeading(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (iso === toIsoDate()) return 'Today';
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (iso === toIsoDate(yest)) return 'Yesterday';
  return dt.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

function pctChange(cur: number, prev: number): { value: string; up: boolean } | undefined {
  if (!(prev > 0)) return undefined;
  const p = ((cur - prev) / prev) * 100;
  if (!Number.isFinite(p)) return undefined;
  return { value: `${Math.abs(p).toFixed(0)}%`, up: p >= 0 };
}

// -------------------------------------------------------------------- tab --

export default function TransactionsTab() {
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const user = useAuthStore((s) => s.user);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const transactionsServerConfirmed = useSyncStatusStore((s) => s.transactionsServerConfirmed);
  // Same "already known, or server-confirmed empty" reasoning as
  // Dashboard.tsx — otherwise this briefly flashes "0 in · 0 out" while
  // transactions are still loading, most visible on a slower connection.
  const cashflowDataKnown = transactionsServerConfirmed;
  const transactions = useMemo(
    () => (activeProfileId ? allTransactions.filter((t) => t.profileId === activeProfileId) : allTransactions),
    [allTransactions, activeProfileId]
  );

  // Modal / menus
  const [modalOpen, setModalOpen] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>('expense');
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [pendingDeleteIds, setPendingDeleteIds] = useState<string[] | null>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Filters
  const [period, setPeriod] = useState<Period>('all');
  const [anchor, setAnchor] = useState(() => monthOf(toIsoDate()));
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | TransactionType>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [sortKey, setSortKey] = useState<'date' | 'amount'>('date');
  const [sortDesc, setSortDesc] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenuOpen(false);
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const { cur, prev, label: periodLabel } = useMemo(
    () => rangesFor(period, anchor, customFrom, customTo),
    [period, anchor, customFrom, customTo]
  );

  const periodTx = useMemo(() => transactions.filter((t) => inRange(t.date, cur)), [transactions, cur]);
  const prevTx = useMemo(() => (prev ? transactions.filter((t) => inRange(t.date, prev)) : []), [transactions, prev]);

  const sum = (list: Transaction[], type: TransactionType) =>
    list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
  const income = sum(periodTx, 'income');
  const expense = sum(periodTx, 'expense');
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : undefined;
  const incomeDelta = prev ? pctChange(income, sum(prevTx, 'income')) : undefined;
  const expenseDelta = prev ? pctChange(expense, sum(prevTx, 'expense')) : undefined;

  // Every category seen (case-insensitive), for the filter dropdown + form suggestions.
  const categoryCounts = useMemo(() => {
    const map = new Map<string, { name: string; count: number }>();
    for (const t of transactions) {
      const k = catKey(t.category);
      const e = map.get(k);
      if (e) e.count += 1;
      else map.set(k, { name: t.category, count: 1 });
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [transactions]);

  // Top expense categories for the current period.
  const topExpense = useMemo(() => {
    const map = new Map<string, { name: string; total: number }>();
    for (const t of periodTx) {
      if (t.type !== 'expense') continue;
      const k = catKey(t.category);
      const e = map.get(k);
      if (e) e.total += t.amount;
      else map.set(k, { name: t.category, total: t.amount });
    }
    return [...map.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [periodTx]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = periodTx.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false;
      if (categoryFilter && catKey(t.category) !== categoryFilter) return false;
      if (q) {
        const hay = `${t.category} ${t.note ?? ''} ${t.amount} ${t.date} ${formatDate(t.date)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sortDesc ? -1 : 1;
    return list.sort((a, b) =>
      sortKey === 'amount' ? dir * (a.amount - b.amount) : dir * a.date.localeCompare(b.date)
    );
  }, [periodTx, query, typeFilter, categoryFilter, sortKey, sortDesc]);

  const groups = useMemo(() => {
    if (sortKey !== 'date') return null;
    const out: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of visible) {
      let g = out[out.length - 1];
      if (!g || g.date !== t.date) {
        g = { date: t.date, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(t);
      g.net += t.type === 'income' ? t.amount : -t.amount;
    }
    return out;
  }, [visible, sortKey]);

  const filtersActive = typeFilter !== 'all' || !!categoryFilter || !!query.trim();
  const clearFilters = () => {
    setTypeFilter('all');
    setCategoryFilter('');
    setQuery('');
  };

  // Selection
  const toggleSelected = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const selectedTx = visible.filter((t) => selected.has(t.id));
  const selectedNet = selectedTx.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
  const allVisibleSelected = visible.length > 0 && visible.every((t) => selected.has(t.id));

  const confirmDelete = async () => {
    if (!pendingDeleteIds || !user) return;
    for (const id of pendingDeleteIds) await removeDoc(user, 'transactions', id);
    setSelected((s) => {
      const n = new Set(s);
      pendingDeleteIds.forEach((id) => n.delete(id));
      return n;
    });
    setPendingDeleteIds(null);
  };

  const handleSave = async (t: Transaction, keepOpen = false) => {
    if (!user) return;
    await upsertDoc(user, 'transactions', t.profileId ? t : { ...t, profileId: activeProfileId ?? undefined });
    if (!keepOpen) {
      setModalOpen(false);
      setEditing(null);
    }
  };

  const openModal = (type: TransactionType) => {
    setEditing(null);
    setModalType(type);
    setModalOpen(true);
    setAddMenuOpen(false);
  };
  const openEdit = (t: Transaction) => {
    setEditing(t);
    setModalType(t.type);
    setModalOpen(true);
  };
  const duplicate = (t: Transaction) => {
    // New entry prefilled from this one (no id → the form treats it as new).
    setEditing({ ...t, id: '', date: toIsoDate(), assetId: undefined, dividend: undefined });
    setModalType(t.type);
    setModalOpen(true);
  };

  const exportRows = () =>
    visible.map((t) => ({
      Date: formatDate(t.date),
      Category: t.category,
      Type: t.type,
      Amount: t.amount,
      Currency: t.currency,
      Note: t.note ?? '',
    }));
  const handleExport = (kind: 'csv' | 'xlsx') => {
    setExportMenuOpen(false);
    if (kind === 'csv') exportToCsv('transactions', exportRows());
    else exportToXlsx('transactions', exportRows(), 'Transactions');
  };

  const fmtDate = (iso: string) => formatDate(iso) || iso;

  const renderRow = (t: Transaction, showDate: boolean) => {
    const isSel = selected.has(t.id);
    return (
      <li
        key={t.id}
        onClick={() => openEdit(t)}
        className={cn(
          'group px-3 sm:px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-surface-hover transition-colors',
          isSel && 'bg-brand-50/60 dark:bg-brand-950/20'
        )}
      >
        <input
          type="checkbox"
          checked={isSel}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggleSelected(t.id)}
          aria-label="Select transaction"
          className="h-4 w-4 rounded border-line accent-[var(--color-brand-600,#15803d)] shrink-0"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink truncate flex items-center gap-2">
            {t.category}
            {t.dividend && <Badge variant="neutral">{t.dividend.kind}</Badge>}
          </p>
          <p className="text-xs text-muted mt-0.5 truncate">
            {showDate && <span>{fmtDate(t.date)}</span>}
            {showDate && t.note ? ' · ' : ''}
            {t.note}
          </p>
        </div>
        <span
          className={cn(
            'font-numeric text-sm font-semibold whitespace-nowrap',
            t.type === 'income' ? 'text-positive' : 'text-ink'
          )}
        >
          {t.type === 'expense' ? '−' : '+'}
          <Amount value={t.amount} currency={t.currency} />
        </span>
        <div className="flex items-center shrink-0 sm:opacity-0 sm:group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <IconButton
            label="Duplicate"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              duplicate(t);
            }}
          >
            <Copy size={15} />
          </IconButton>
          <IconButton
            label="Edit"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              openEdit(t);
            }}
          >
            <Pencil size={15} />
          </IconButton>
          <IconButton
            label="Delete transaction"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              setPendingDeleteIds([t.id]);
            }}
            className="hover:!text-negative"
          >
            <Trash2 size={15} />
          </IconButton>
        </div>
      </li>
    );
  };

  return (
    <div className="space-y-5">
      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                period === p.key ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        {period === 'month' && (
          <div className="flex items-center gap-1">
            <IconButton label="Previous month" size="sm" onClick={() => setAnchor((a) => shiftMonth(a, -1))}>
              <ChevronLeft size={16} />
            </IconButton>
            <span className="text-sm font-semibold text-ink min-w-[120px] text-center">{monthLabel(anchor)}</span>
            <IconButton
              label="Next month"
              size="sm"
              disabled={anchor >= monthOf(toIsoDate())}
              onClick={() => setAnchor((a) => shiftMonth(a, 1))}
            >
              <ChevronRight size={16} />
            </IconButton>
          </div>
        )}
        {(period === '3m' || period === '6m' || period === 'fy') && (
          <span className="text-sm font-semibold text-ink">{periodLabel}</span>
        )}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <DateInput value={customFrom} onChange={setCustomFrom} className={`${inputClasses} w-36`} />
            <span className="text-muted text-sm">to</span>
            <DateInput value={customTo} onChange={setCustomTo} className={`${inputClasses} w-36`} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          dense
          label="Income"
          tone="positive"
          loading={!cashflowDataKnown}
          value={<Amount value={income} />}
          delta={incomeDelta ? { value: incomeDelta.value, positive: incomeDelta.up } : undefined}
        />
        <StatCard
          dense
          label="Expenses"
          loading={!cashflowDataKnown}
          value={<Amount value={expense} />}
          // More spending than last period is the "bad" direction.
          delta={expenseDelta ? { value: expenseDelta.value, positive: !expenseDelta.up } : undefined}
        />
        <StatCard
          dense
          label="Net"
          loading={!cashflowDataKnown}
          tone={net >= 0 ? 'default' : 'negative'}
          value={<Amount value={net} />}
          sublabel={savingsRate !== undefined ? `Savings rate ${savingsRate.toFixed(0)}%` : undefined}
        />
      </div>

      {/* Top spending categories */}
      {topExpense.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-ink">Top spending · {periodLabel}</h3>
            {categoryFilter && (
              <button type="button" onClick={() => setCategoryFilter('')} className="text-xs text-brand-600 hover:underline">
                Clear category filter
              </button>
            )}
          </div>
          <ul className="space-y-2.5">
            {topExpense.map((c) => {
              const pct = expense > 0 ? (c.total / expense) * 100 : 0;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => {
                      setCategoryFilter((cur2) => (cur2 === c.key ? '' : c.key));
                      setTypeFilter('expense');
                    }}
                    className="w-full text-left"
                  >
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className={cn('font-medium', categoryFilter === c.key ? 'text-brand-700' : 'text-ink')}>{c.name}</span>
                      <span className="font-numeric text-muted">
                        <Amount value={c.total} /> · {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.max(2, pct)}%` }} />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Toolbar: search + filters + actions */}
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1 min-w-0">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search category, note or amount"
            className={`${inputClasses} pl-9 pr-9`}
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setQuery('')}
              className="absolute right-0 top-0 h-full w-9 flex items-center justify-center text-muted hover:text-ink"
            >
              <X size={15} />
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60">
            {(['all', 'income', 'expense'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTypeFilter(k)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md capitalize transition-colors',
                  typeFilter === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                )}
              >
                {k}
              </button>
            ))}
          </div>
          <CustomSelect
            value={categoryFilter}
            onChange={setCategoryFilter}
            className={`${inputClasses} w-44`}
            options={[
              { value: '', label: 'All categories' },
              ...categoryCounts.map(([k, v]) => ({ value: k, label: `${v.name} (${v.count})` })),
            ]}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (sortKey === 'date' && sortDesc) {
                setSortDesc(false);
              } else if (sortKey === 'date') {
                setSortKey('amount');
                setSortDesc(true);
              } else if (sortDesc) {
                setSortDesc(false);
              } else {
                setSortKey('date');
                setSortDesc(true);
              }
            }}
            leftIcon={<ArrowUpDown size={15} />}
          >
            {sortKey === 'date' ? 'Date' : 'Amount'} {sortDesc ? '↓' : '↑'}
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {visible.length} {visible.length === 1 ? 'entry' : 'entries'}
          {filtersActive && (
            <>
              {' · '}
              <button type="button" onClick={clearFilters} className="text-brand-600 hover:underline">
                clear filters
              </button>
            </>
          )}
        </p>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="secondary"
              onClick={() => setExportMenuOpen((o) => !o)}
              disabled={visible.length === 0}
              leftIcon={<Download size={15} />}
              rightIcon={<ChevronDown size={14} className="opacity-70" />}
            >
              Export
            </Button>
            {exportMenuOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-44 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-10 py-1">
                <button onClick={() => handleExport('csv')} className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover">
                  CSV (.csv)
                </button>
                <button onClick={() => handleExport('xlsx')} className="w-full text-left px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover">
                  Excel (.xlsx)
                </button>
              </div>
            )}
          </div>
          <div className="relative" ref={addMenuRef}>
            <Button
              onClick={() => setAddMenuOpen((o) => !o)}
              leftIcon={<Plus size={16} />}
              rightIcon={<ChevronDown size={15} className="opacity-80" />}
            >
              Add
            </Button>
            {addMenuOpen && (
              <div className="animate-menu-in absolute right-0 mt-2 w-48 bg-surface border border-line rounded-xl shadow-lg overflow-hidden z-10 py-1">
                <button
                  onClick={() => openModal('expense')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover"
                >
                  <ArrowDownCircle size={16} className="text-muted" /> Add expense
                </button>
                <button
                  onClick={() => openModal('income')}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover"
                >
                  <ArrowUpCircle size={16} className="text-positive" /> Add income
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedTx.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 dark:bg-brand-950/30 px-4 py-2.5 text-sm">
          <span className="font-medium text-ink">
            {selectedTx.length} selected · net{' '}
            <span className={selectedNet >= 0 ? 'text-positive' : 'text-negative'}>
              {selectedNet >= 0 ? '+' : '−'}
              <Amount value={Math.abs(selectedNet)} />
            </span>
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelected(new Set())} className="text-muted hover:text-ink">
              Clear
            </button>
            <Button variant="secondary" onClick={() => setPendingDeleteIds(selectedTx.map((t) => t.id))} leftIcon={<Trash2 size={14} />}>
              Delete
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <Card padding="none">
          <EmptyState
            icon={<Receipt size={18} />}
            title={transactions.length === 0 ? 'No entries yet' : 'Nothing matches'}
            description={
              transactions.length === 0
                ? 'Log your salary, rent, groceries, and more.'
                : period !== 'all' && !filtersActive
                  ? `No entries for ${periodLabel}.`
                  : 'Try a different period or clear the filters.'
            }
            action={
              transactions.length === 0 ? (
                <Button onClick={() => openModal('expense')} leftIcon={<Plus size={16} />}>
                  Add transaction
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() => {
                    clearFilters();
                    setPeriod('all');
                  }}
                >
                  Show everything
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <Card padding="none" className="overflow-hidden">
          <div className="flex items-center gap-3 px-3 sm:px-4 py-2 border-b border-line-soft text-xs text-muted">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={() =>
                setSelected((s) => {
                  const n = new Set(s);
                  if (allVisibleSelected) visible.forEach((t) => n.delete(t.id));
                  else visible.forEach((t) => n.add(t.id));
                  return n;
                })
              }
              aria-label="Select all"
              className="h-4 w-4 rounded border-line accent-[var(--color-brand-600,#15803d)]"
            />
            Select all
          </div>
          {groups ? (
            groups.map((g) => (
              <div key={g.date}>
                <div className="flex items-center justify-between px-3 sm:px-4 py-1.5 bg-slate-50 dark:bg-slate-800/40 border-b border-line-soft text-xs">
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{dayHeading(g.date)}</span>
                  <span className={cn('font-numeric font-medium', g.net >= 0 ? 'text-positive' : 'text-muted')}>
                    {g.net >= 0 ? '+' : '−'}
                    <Amount value={Math.abs(g.net)} />
                  </span>
                </div>
                <ul className="divide-y divide-line-soft">{g.items.map((t) => renderRow(t, false))}</ul>
              </div>
            ))
          ) : (
            <ul className="divide-y divide-line-soft">{visible.map((t) => renderRow(t, true))}</ul>
          )}
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditing(null);
        }}
        title={editing?.id ? 'Edit Entry' : modalType === 'income' ? 'Add Income' : 'Add Expense'}
      >
        <TransactionForm
          key={editing?.id || (editing ? 'dup' : modalType) + String(modalOpen)}
          initialType={modalType}
          initial={editing}
          knownCategories={categoryCounts.map(([, v]) => ({ name: v.name }))}
          onSave={handleSave}
        />
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDeleteIds}
        onClose={() => setPendingDeleteIds(null)}
        onConfirm={confirmDelete}
        title={pendingDeleteIds && pendingDeleteIds.length > 1 ? `Delete ${pendingDeleteIds.length} transactions?` : 'Delete this transaction?'}
        description="This will permanently delete the selected transaction(s). This can't be undone."
      />
    </div>
  );
}

// ------------------------------------------------------------------- form --

function TransactionForm({
  initialType,
  initial,
  knownCategories,
  onSave,
}: {
  initialType: TransactionType;
  /** Entry being edited (has an id) or duplicated (empty id). */
  initial: Transaction | null;
  knownCategories: { name: string }[];
  onSave: (t: Transaction, keepOpen?: boolean) => void | Promise<void>;
}) {
  const isEdit = !!initial?.id;
  // Sales/dividends logged from a holding already moved an account balance by
  // this exact amount, so changing the amount/type here would desync it.
  const linked = isEdit && !!initial?.assetId;

  const [type, setType] = useState<TransactionType>(initial?.type ?? initialType);
  const [category, setCategory] = useState(initial?.category ?? '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency ?? 'INR');
  const [date, setDate] = useState(initial?.date ?? toIsoDate());
  const [note, setNote] = useState(initial?.note ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const suggestions = useMemo(() => {
    const presets = type === 'income' ? INCOME_PRESETS : EXPENSE_PRESETS;
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of [...knownCategories.map((k) => k.name), ...presets]) {
      const k = catKey(c);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
    const q = catKey(category);
    return out.filter((c) => !q || catKey(c).includes(q)).slice(0, 8);
  }, [knownCategories, type, category]);

  const build = (): Transaction | null => {
    const amt = Number(amount);
    if (!category.trim()) {
      setError('Pick or type a category.');
      return null;
    }
    if (!amt || amt <= 0) {
      setError('Enter an amount greater than 0.');
      return null;
    }
    if (date > toIsoDate()) {
      setError('Date cannot be in the future.');
      return null;
    }
    // Firestore rejects undefined, so build the object without empty optionals.
    const base: Transaction = {
      id: isEdit ? initial!.id : crypto.randomUUID(),
      type,
      category: category.trim(),
      amount: amt,
      currency,
      date,
    };
    if (note.trim()) base.note = note.trim();
    if (isEdit) {
      if (initial!.profileId) base.profileId = initial!.profileId;
      if (initial!.assetId) base.assetId = initial!.assetId;
      if (initial!.dividend) base.dividend = initial!.dividend;
    } else if (initial?.profileId) {
      base.profileId = initial.profileId;
    }
    return base;
  };

  const submit = async (keepOpen: boolean) => {
    const t = build();
    if (!t) return;
    setError('');
    setSaving(true);
    try {
      await onSave(t, keepOpen);
      if (keepOpen) {
        setAmount('');
        setNote('');
      }
    } catch {
      setError('Could not save. Please check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(['expense', 'income'] as TransactionType[]).map((t) => (
          <button
            key={t}
            type="button"
            disabled={linked}
            onClick={() => setType(t)}
            className={`flex-1 py-2 rounded-lg text-base font-medium border disabled:opacity-50 ${
              type === t ? 'bg-brand-600 text-white border-brand-600' : 'border-line text-slate-500'
            }`}
          >
            {t === 'income' ? 'Income' : 'Expense'}
          </button>
        ))}
      </div>
      <Field label="Category">
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={inputClass}
          placeholder="e.g. Rent, Salary, Groceries"
        />
        {suggestions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {suggestions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={cn(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                  catKey(category) === catKey(c)
                    ? 'bg-brand-600 border-brand-600 text-white'
                    : 'border-line text-slate-600 dark:text-slate-300 hover:bg-surface-hover'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            disabled={linked}
            onChange={(e) => setAmount(e.target.value)}
            className={`${inputClass} disabled:opacity-60`}
            placeholder="0"
          />
        </Field>
        <Field label="Currency">
          <CurrencySelect value={currency} onChange={setCurrency} className={inputClass} />
        </Field>
      </div>
      {linked && (
        <p className="text-xs text-muted -mt-2">
          This entry came from a holding's sale or dividend, so its amount and type are locked.
        </p>
      )}
      <Field label="Date">
        <DateInput value={date} onChange={(v) => setDate(v)} className={inputClass} />
      </Field>
      <Field label="Note (optional)">
        <input value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} placeholder="e.g. Paid via UPI, shared with Dad" />
      </Field>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        {!isEdit && (
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(true)}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg border border-line text-slate-600 dark:text-slate-300 hover:bg-surface-hover flex-1 disabled:opacity-50"
          >
            Save &amp; add another
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => submit(false)}
          className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50"
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Save Entry'}
        </button>
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

const inputClass = inputClasses;
