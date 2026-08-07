import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTransactionsStore } from '../../store/transactionsStore';
import { useBudgetStore } from '../../store/budgetStore';
import { formatCurrency } from '../../utils/currency';
import Amount from '../../components/Amount';

const COLORS = ['#16a35d', '#3b82f6', '#f5b942', '#f97316', '#8b5cf6', '#ef4444', '#4ade93', '#94a3b8', '#3b82f6', '#64748b'];

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function InsightsTab() {
  const transactions = useTransactionsStore((s) => s.transactions);
  const budgetItems = useBudgetStore((s) => s.items);
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const monthTx = transactions.filter((t) => t.date.startsWith(month));
  const income = monthTx.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
  const planned = budgetItems
    .filter((i) => i.month === month)
    .reduce((s, i) => s + i.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    monthTx
      .filter((t) => t.type === 'expense')
      .forEach((t) => map.set(t.category, (map.get(t.category) ?? 0) + t.amount));
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="font-semibold text-slate-900 dark:text-white text-lg">{monthLabel(month)}</span>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Income</p>
          <p className="text-xl font-bold text-brand-600 dark:text-brand-300">
            <Amount value={income} />
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Spent</p>
          <p className="text-xl font-bold text-orange-500">
            <Amount value={expense} />
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">Planned (Budget)</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">
            {planned > 0 ? <Amount value={planned} /> : '—'}
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4">Spending by category</h2>
        {byCategory.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 text-sm py-10">
            No expenses logged for this month yet.
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
    </div>
  );
}
