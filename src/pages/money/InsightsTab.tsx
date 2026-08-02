import { useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Briefcase, ChevronDown, Check, Wallet } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useAssetsStore } from '../../store/assetsStore';
import { formatCurrency } from '../../utils/currency';
import Amount from '../../components/Amount';
import { RANGE_OPTIONS, getInsightsRange, type InsightsRangeKey } from '../../utils/dateRanges';

const COLORS = ['#16a35d', '#3b82f6', '#f5b942', '#f97316', '#8b5cf6', '#ef4444', '#4ade93', '#94a3b8', '#3b82f6', '#64748b'];

const INVESTMENT_CATEGORY = 'Investment';

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);
  return ref;
}

function AccountsFilterDropdown({
  accounts,
  selected,
  onChange,
}: {
  accounts: { id: string; name: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(() => setOpen(false));

  const allSelected = selected.length === 0;
  const summary = allSelected
    ? 'All Accounts'
    : selected.length === 1
      ? accounts.find((a) => a.id === selected[0])?.name ?? '1 account'
      : `${selected.length} accounts`;

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((v) => v !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 rounded-full pl-3 pr-2.5 py-1.5 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <Wallet size={14} className="text-slate-400 dark:text-slate-500" />
        <span className="truncate max-w-[120px]">{summary}</span>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-60 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-soft-md p-1.5">
          <button
            type="button"
            onClick={() => onChange([])}
            className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            All Accounts
            {allSelected && <Check size={14} className="text-brand-600" />}
          </button>
          {accounts.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-slate-400 dark:text-slate-500">
              Add a cash/bank account on the Accounts tab to filter by it here.
            </p>
          ) : (
            accounts.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => toggle(a.id)}
                className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-xl text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                <span className="truncate">{a.name}</span>
                {selected.includes(a.id) && <Check size={14} className="text-brand-600 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function InsightStatCard({
  icon,
  tone,
  label,
  value,
  perMonth,
}: {
  icon: React.ReactNode;
  tone: 'income' | 'expense' | 'invested';
  label: string;
  value: number;
  perMonth: number;
}) {
  const toneClasses: Record<typeof tone, string> = {
    income: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
    expense: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
    invested: 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300',
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5">
            <Amount value={value} />
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            <Amount value={perMonth} />/mo
          </p>
        </div>
        <span className={`h-11 w-11 rounded-2xl flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
          {icon}
        </span>
      </div>
    </div>
  );
}

interface InsightsTabProps {
  range: InsightsRangeKey;
  onRangeChange: (range: InsightsRangeKey) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (v: string) => void;
  onCustomToChange: (v: string) => void;
}

export default function InsightsTab({
  range,
  onRangeChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: InsightsTabProps) {
  const transactions = useTransactionsStore((s) => s.transactions);
  const assets = useAssetsStore((s) => s.assets);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);

  const bounds = getInsightsRange(range, customFrom, customTo);

  const accounts = useMemo(
    () => assets.filter((a) => a.assetClass === 'cash').map((a) => ({ id: a.id, name: a.name })),
    [assets],
  );

  // Transactions aren't tied to a specific account yet, so the Accounts
  // filter is a scaffold for when that link exists — it doesn't narrow the
  // numbers below yet, only the date range does.
  const rangeTx = useMemo(
    () => transactions.filter((t) => t.date >= bounds.start && t.date <= bounds.end),
    [transactions, bounds.start, bounds.end],
  );

  const income = rangeTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const investedAmount = rangeTx
    .filter((t) => t.type === 'expense' && t.category === INVESTMENT_CATEGORY)
    .reduce((s, t) => s + t.amount, 0);
  const expenses = rangeTx
    .filter((t) => t.type === 'expense' && t.category !== INVESTMENT_CATEGORY)
    .reduce((s, t) => s + t.amount, 0);

  const months = Math.max(1, bounds.months);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    rangeTx
      .filter((t) => t.type === 'expense')
      .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rangeTx]);

  return (
    <div className="space-y-5">
      {/* ---- Filter pills + Accounts dropdown ---- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-full">
          {RANGE_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onRangeChange(opt.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                range === opt.key
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <AccountsFilterDropdown accounts={accounts} selected={selectedAccounts} onChange={setSelectedAccounts} />
        </div>
      </div>

      {range === 'custom' && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            From
            <input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
            To
            <input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="border border-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
        </div>
      )}

      {/* ---- Stat cards ---- */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <InsightStatCard
          tone="income"
          icon={<TrendingUp size={20} strokeWidth={2} />}
          label="Total Income"
          value={income}
          perMonth={income / months}
        />
        <InsightStatCard
          tone="expense"
          icon={<TrendingDown size={20} strokeWidth={2} />}
          label="Total Expenses"
          value={expenses}
          perMonth={expenses / months}
        />
        <InsightStatCard
          tone="invested"
          icon={<Briefcase size={20} strokeWidth={2} />}
          label="Total Invested"
          value={investedAmount}
          perMonth={investedAmount / months}
        />
      </div>

      {/* ---- Body: empty state, or breakdown once there's data ---- */}
      {rangeTx.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-slate-500 dark:text-slate-400 text-sm">
          No transactions yet — add income or expenses to see insights here.
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
          <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Spending by category</h2>
          {byCategory.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">
              No expenses logged for this period yet.
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-full sm:w-56 h-56 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90} paddingAngle={2}>
                      {byCategory.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => formatCurrency(Number(v) || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex-1 w-full space-y-2">
                {byCategory.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100 whitespace-nowrap">
                      <Amount value={c.value} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
