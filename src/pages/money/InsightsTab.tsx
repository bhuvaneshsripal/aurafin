import { useMemo, useState } from 'react';
import { hideNumber } from '../../utils/privateFormat';
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, AlertTriangle, Sparkles, X } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { useTransactionsStore } from '../../store/transactionsStore';
import { budgetKey } from '../../utils/budgetCategories';
import { useBudgetStore } from '../../store/budgetStore';
import { useSyncStatusStore } from '../../store/syncStatusStore';
import { useHouseholdProfilesStore } from '../../store/householdProfilesStore';
import { useUiStore } from '../../store/uiStore';
import { maskAmount } from '../../utils/currency';
import { formatDate, toIsoMonth } from '../../utils/date';
import Amount from '../../components/Amount';
import LoadingDots from '../../components/LoadingDots';
import { chart } from '../../components/ui/chartTheme';
import { cn } from '../../components/ui/cn';
import type { Transaction, TransactionType } from '../../types';

const COLORS = ['#16a35d', '#3b82f6', '#f5b942', '#f97316', '#8b5cf6', '#ef4444', '#4ade93', '#94a3b8', '#0ea5e9', '#64748b'];

function monthLabel(month: string, short = false) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', short ? { month: 'short' } : { month: 'long', year: 'numeric' });
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const catKey = (c: string) => budgetKey(c);
const compact = (n: number) =>
  Math.abs(n) >= 1e7 ? `${(n / 1e7).toFixed(1)}Cr` : Math.abs(n) >= 1e5 ? `${(n / 1e5).toFixed(1)}L` : Math.abs(n) >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n));

function pctChange(cur: number, prev: number): number | undefined {
  if (!(prev > 0)) return undefined;
  return ((cur - prev) / prev) * 100;
}

function Delta({ pct, goodWhenDown }: { pct: number | undefined; goodWhenDown?: boolean }) {
  if (pct === undefined || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = goodWhenDown ? !up : up;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-medium', good ? 'text-positive' : 'text-negative')}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
      {hideNumber(`${Math.abs(pct).toFixed(0)}%`)} vs last month
    </span>
  );
}

function sumBy(list: Transaction[], type: TransactionType) {
  return list.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);
}

function groupByCategory(list: Transaction[], type: TransactionType) {
  const map = new Map<string, { name: string; value: number; count: number }>();
  for (const t of list) {
    if (t.type !== type) continue;
    const k = catKey(t.category);
    const e = map.get(k);
    if (e) {
      e.value += t.amount;
      e.count += 1;
    } else map.set(k, { name: t.category, value: t.amount, count: 1 });
  }
  return map;
}

export default function InsightsTab() {
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const budgetItems = useBudgetStore((s) => s.items);
  // Income / expense totals come from saved entries, not live prices, so show them as soon as the
  // first snapshot (cache or server) has arrived instead of waiting for server confirmation.
  const transactionsLoaded = useSyncStatusStore((s) => !!s.loadedCollections['transactions']);
  const privacyMode = useUiStore((s) => s.privacyMode);
  // Same "already known, or server-confirmed empty" reasoning as
  // Dashboard.tsx — otherwise Income/Spent briefly flash ₹0 while
  // transactions are still loading.
  const cashflowDataKnown = transactionsLoaded;
  const thisMonth = toIsoMonth();
  const [month, setMonth] = useState(thisMonth);
  const [flow, setFlow] = useState<TransactionType>('expense');
  const [drill, setDrill] = useState<string | null>(null); // category key

  const transactions = useMemo(
    () => (activeProfileId ? allTransactions.filter((t) => t.profileId === activeProfileId) : allTransactions),
    [allTransactions, activeProfileId]
  );
  const money = (v: number) => maskAmount(v, 'INR', privacyMode);

  const prevMonth = shiftMonth(month, -1);
  const monthTx = useMemo(() => transactions.filter((t) => t.date.startsWith(month)), [transactions, month]);
  const prevTx = useMemo(() => transactions.filter((t) => t.date.startsWith(prevMonth)), [transactions, prevMonth]);

  const income = sumBy(monthTx, 'income');
  const expense = sumBy(monthTx, 'expense');
  const net = income - expense;
  const savingsRate = income > 0 ? (net / income) * 100 : undefined;
  const prevIncome = sumBy(prevTx, 'income');
  const prevExpense = sumBy(prevTx, 'expense');

  const planned = budgetItems.filter((i) => i.month === month).reduce((s, i) => s + i.amount, 0);
  const budgetUsedPct = planned > 0 ? (expense / planned) * 100 : undefined;

  // --- days / projection --------------------------------------------------
  const [yy, mm] = month.split('-').map(Number);
  const daysInMonth = new Date(yy, mm, 0).getDate();
  const isCurrent = month === thisMonth;
  const isFuture = month > thisMonth;
  const today = new Date();
  const daysElapsed = isCurrent ? today.getDate() : isFuture ? 0 : daysInMonth;
  const avgPerDay = daysElapsed > 0 ? expense / daysElapsed : 0;
  const projected = isCurrent && daysElapsed > 0 ? (expense / daysElapsed) * daysInMonth : undefined;

  const daily = useMemo(() => {
    const arr = Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, spent: 0 }));
    for (const t of monthTx) if (t.type === 'expense') arr[Number(t.date.slice(8, 10)) - 1].spent += t.amount;
    return arr;
  }, [monthTx, daysInMonth]);
  const noSpendDays = daily.slice(0, daysElapsed).filter((d) => d.spent === 0).length;
  const peakDay = daily.reduce((a, b) => (b.spent > a.spent ? b : a), { day: 0, spent: 0 });

  // --- 6-month trend ------------------------------------------------------
  const trend = useMemo(() => {
    const out: { month: string; label: string; income: number; expense: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = shiftMonth(month, -i);
      const list = transactions.filter((t) => t.date.startsWith(m));
      out.push({ month: m, label: monthLabel(m, true), income: sumBy(list, 'income'), expense: sumBy(list, 'expense') });
    }
    return out;
  }, [transactions, month]);
  const trendHasData = trend.some((t) => t.income > 0 || t.expense > 0);

  // --- categories ---------------------------------------------------------
  const prevByCat = useMemo(() => groupByCategory(prevTx, flow), [prevTx, flow]);
  const byCategory = useMemo(() => {
    const cur = groupByCategory(monthTx, flow);
    const total = [...cur.values()].reduce((s, c) => s + c.value, 0);
    const budgets = new Map<string, number>();
    for (const b of budgetItems) if (b.month === month) budgets.set(catKey(b.category), (budgets.get(catKey(b.category)) ?? 0) + b.amount);
    return [...cur.entries()]
      .map(([key, c]) => ({
        key,
        ...c,
        share: total > 0 ? (c.value / total) * 100 : 0,
        change: pctChange(c.value, prevByCat.get(key)?.value ?? 0),
        budget: flow === 'expense' ? budgets.get(key) : undefined,
      }))
      .sort((a, b) => b.value - a.value);
  }, [monthTx, flow, prevByCat, budgetItems, month]);
  const flowTotal = flow === 'expense' ? expense : income;

  // Budgeted categories with no spending yet still matter for "remaining".
  const overBudget = byCategory.filter((c) => c.budget !== undefined && c.value > c.budget);

  const drillTx = useMemo(
    () =>
      drill
        ? monthTx
            .filter((t) => t.type === flow && catKey(t.category) === drill)
            .sort((a, b) => b.date.localeCompare(a.date))
        : [],
    [drill, monthTx, flow]
  );

  const topExpenses = useMemo(
    () => monthTx.filter((t) => t.type === 'expense').sort((a, b) => b.amount - a.amount).slice(0, 5),
    [monthTx]
  );

  // --- plain-language highlights -----------------------------------------
  const highlights = useMemo(() => {
    const out: { tone: 'good' | 'warn' | 'info'; text: string }[] = [];
    const expCats = [...groupByCategory(monthTx, 'expense').entries()];
    const prevExp = groupByCategory(prevTx, 'expense');
    if (expense > 0 && expCats.length) {
      const top = expCats.map(([, c]) => c).sort((a, b) => b.value - a.value)[0];
      out.push({ tone: 'info', text: `${top.name} is your biggest expense — ${hideNumber(`${((top.value / expense) * 100).toFixed(0)}%`)} of this month's spending.` });
    }
    const risers = expCats
      .map(([k, c]) => ({ ...c, change: pctChange(c.value, prevExp.get(k)?.value ?? 0), prev: prevExp.get(k)?.value ?? 0 }))
      .filter((c) => c.change !== undefined && c.change >= 25 && c.value - c.prev >= 500)
      .sort((a, b) => b.value - b.prev - (a.value - a.prev));
    if (risers[0]) out.push({ tone: 'warn', text: `${risers[0].name} is up ${hideNumber(`${risers[0].change!.toFixed(0)}%`)} from last month.` });
    if (overBudget.length) out.push({ tone: 'warn', text: `Over budget in ${overBudget.length} ${overBudget.length === 1 ? 'category' : 'categories'}: ${overBudget.slice(0, 3).map((c) => c.name).join(', ')}.` });
    if (projected !== undefined && planned > 0 && projected > planned) {
      out.push({ tone: 'warn', text: `At this pace you'll spend about ${money(projected)} by month end — ${money(projected - planned)} over your ${money(planned)} budget.` });
    } else if (projected !== undefined && planned > 0) {
      out.push({ tone: 'good', text: `On track: projected ${money(projected)} against a ${money(planned)} budget.` });
    }
    if (savingsRate !== undefined) {
      out.push(
        savingsRate >= 20
          ? { tone: 'good', text: `You're saving ${hideNumber(`${savingsRate.toFixed(0)}%`)} of your income this month.` }
          : savingsRate < 0
            ? { tone: 'warn', text: `Spending is ${money(-net)} more than income this month.` }
            : { tone: 'info', text: `Savings rate is ${hideNumber(`${savingsRate.toFixed(0)}%`)} — the common target is 20% or more.` }
      );
    }
    if (daysElapsed >= 7 && noSpendDays >= 3) out.push({ tone: 'good', text: `${noSpendDays} no-spend days so far this month.` });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthTx, prevTx, overBudget, projected, planned, savingsRate, net, noSpendDays, daysElapsed, expense, privacyMode]);

  const tooltipMoney = (v: unknown) => money(Number(v) || 0);

  return (
    <div className="space-y-4">
      {/* Month stepper */}
      <div className="flex items-center justify-center gap-4">
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          aria-label="Previous month"
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          onClick={() => {
            setMonth(thisMonth);
            setDrill(null);
          }}
          title="Jump to this month"
          className="font-semibold text-ink text-lg"
        >
          {monthLabel(month)}
        </button>
        <button
          onClick={() => setMonth((m) => shiftMonth(m, 1))}
          disabled={month >= thisMonth}
          aria-label="Next month"
          className="tap-scale h-8 w-8 flex items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-surface rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">Income</p>
          <p className="text-xl font-bold text-brand-600 dark:text-brand-300">
            {cashflowDataKnown ? <Amount value={income} /> : <LoadingDots />}
          </p>
          <Delta pct={pctChange(income, prevIncome)} />
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">Spent</p>
          <p className="text-xl font-bold text-orange-500">
            {cashflowDataKnown ? <Amount value={expense} /> : <LoadingDots />}
          </p>
          <Delta pct={pctChange(expense, prevExpense)} goodWhenDown />
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">Net saved</p>
          <p className={cn('text-xl font-bold', net >= 0 ? 'text-ink' : 'text-negative')}>
            {cashflowDataKnown ? (
              <>
                {net < 0 && '−'}
                <Amount value={Math.abs(net)} />
              </>
            ) : (
              <LoadingDots />
            )}
          </p>
          {savingsRate !== undefined && <p className="text-xs text-muted">Savings rate {hideNumber(`${savingsRate.toFixed(0)}%`)}</p>}
        </div>
        <div className="bg-surface rounded-2xl border border-line p-4">
          <p className="text-sm text-muted">Budget</p>
          <p className="text-xl font-bold text-ink">{planned > 0 ? <Amount value={planned} /> : '—'}</p>
          {budgetUsedPct !== undefined ? (
            <div className="mt-1.5">
              <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={cn('h-full rounded-full', budgetUsedPct > 100 ? 'bg-negative' : budgetUsedPct > 80 ? 'bg-amber-500' : 'bg-brand-600')}
                  style={{ width: `${Math.min(100, budgetUsedPct)}%` }}
                />
              </div>
              <p className="text-xs text-muted mt-1">
                {hideNumber(`${budgetUsedPct.toFixed(0)}%`)} used ·{' '}
                {expense <= planned ? (
                  <>
                    <Amount value={planned - expense} /> left
                  </>
                ) : (
                  <>
                    <Amount value={expense - planned} /> over
                  </>
                )}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted">Set one in the Budget tab</p>
          )}
        </div>
      </div>

      {/* Highlights */}
      {highlights.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-4 sm:p-5">
          <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
            <Sparkles size={16} className="text-brand-600" /> Highlights
          </h2>
          <ul className="space-y-2">
            {highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-ink-2">
                {h.tone === 'warn' ? (
                  <AlertTriangle size={15} className="text-amber-500 mt-0.5 shrink-0" />
                ) : h.tone === 'good' ? (
                  <TrendingUp size={15} className="text-positive mt-0.5 shrink-0" />
                ) : (
                  <Sparkles size={15} className="text-muted mt-0.5 shrink-0" />
                )}
                <span>{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Cash-flow trend */}
      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-ink">Income vs spending · 6 months</h2>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: chart.primary }} />Income</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-orange-500" />Spent</span>
          </div>
        </div>
        {!trendHasData ? (
          <div className="text-center text-muted text-sm py-10">Nothing logged in these months yet.</div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={trend}
                barGap={4}
                onClick={(s) => {
                  const m = (s as { activePayload?: { payload?: { month?: string } }[] } | null)?.activePayload?.[0]?.payload?.month;
                  if (m) {
                    setMonth(m);
                    setDrill(null);
                  }
                }}
              >
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} />
                <YAxis tick={chart.tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (privacyMode ? '' : compact(Number(v)))} />
                <Tooltip formatter={tooltipMoney} {...chart.tooltip} cursor={{ fill: 'var(--color-surface-hover)' }} />
                <Bar dataKey="income" name="Income" fill={chart.primary} radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="expense" name="Spent" fill="#f97316" radius={[4, 4, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="text-xs text-muted mt-2">Tap a month to open it.</p>
      </div>

      {/* Category breakdown */}
      <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">{flow === 'expense' ? 'Spending' : 'Income'} by category</h2>
          <div className="flex gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-800/60">
            {(['expense', 'income'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setFlow(k);
                  setDrill(null);
                }}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-md capitalize transition-colors',
                  flow === k ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'
                )}
              >
                {k === 'expense' ? 'Spending' : 'Income'}
              </button>
            ))}
          </div>
        </div>
        {byCategory.length === 0 ? (
          <div className="text-center text-muted text-sm py-10">
            No {flow === 'expense' ? 'expenses' : 'income'} logged for this month yet.
          </div>
        ) : (
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <div className="w-full sm:w-56 h-56 shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={byCategory} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="none">
                    {byCategory.map((c, i) => (
                      <Cell
                        key={c.key}
                        fill={COLORS[i % COLORS.length]}
                        opacity={drill && drill !== c.key ? 0.35 : 1}
                        onClick={() => setDrill((d) => (d === c.key ? null : c.key))}
                        style={{ cursor: 'pointer', outline: 'none' }}
                      />
                    ))}
                  </Pie>
                  <Tooltip formatter={tooltipMoney} {...chart.tooltip} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span className="text-xs text-muted">Total</span>
                <span className="text-base font-bold text-ink font-numeric">{money(flowTotal)}</span>
              </div>
            </div>
            <div className="flex-1 w-full space-y-1">
              {byCategory.map((c, i) => {
                const budgetPct = c.budget && c.budget > 0 ? (c.value / c.budget) * 100 : undefined;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setDrill((d) => (d === c.key ? null : c.key))}
                    className={cn(
                      'w-full text-left rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover',
                      drill === c.key && 'bg-surface-hover'
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="flex-1 text-sm text-slate-600 dark:text-slate-300 truncate">{c.name}</span>
                      {c.change !== undefined && Math.abs(c.change) >= 5 && (
                        <span
                          className={cn(
                            'text-[11px] font-medium',
                            (flow === 'expense' ? c.change > 0 : c.change < 0) ? 'text-negative' : 'text-positive'
                          )}
                        >
                          {c.change > 0 ? '▲' : '▼'} {hideNumber(`${Math.abs(c.change).toFixed(0)}%`)}
                        </span>
                      )}
                      <span className="text-xs text-muted w-10 text-right">{hideNumber(`${c.share.toFixed(0)}%`)}</span>
                      <span className="text-sm font-medium text-ink whitespace-nowrap w-24 text-right">
                        <Amount value={c.value} />
                      </span>
                    </div>
                    {budgetPct !== undefined && (
                      <div className="mt-1.5 ml-5 flex items-center gap-2">
                        <div className="flex-1 h-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div
                            className={cn('h-full rounded-full', budgetPct > 100 ? 'bg-negative' : budgetPct > 80 ? 'bg-amber-500' : 'bg-brand-600')}
                            style={{ width: `${Math.min(100, budgetPct)}%` }}
                          />
                        </div>
                        <span className="text-[11px] text-muted whitespace-nowrap">
                          {hideNumber(`${budgetPct.toFixed(0)}%`)} of <Amount value={c.budget!} />
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {drill && drillTx.length > 0 && (
          <div className="mt-4 border-t border-line-soft pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-ink">
                {byCategory.find((c) => c.key === drill)?.name} · {drillTx.length} {drillTx.length === 1 ? 'entry' : 'entries'}
              </h3>
              <button type="button" onClick={() => setDrill(null)} aria-label="Close" className="text-muted hover:text-ink">
                <X size={16} />
              </button>
            </div>
            <ul className="divide-y divide-line-soft">
              {drillTx.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="text-sm text-ink truncate">{t.note || t.category}</p>
                    <p className="text-xs text-muted">{formatDate(t.date)}</p>
                  </div>
                  <span className="text-sm font-medium text-ink font-numeric whitespace-nowrap">
                    <Amount value={t.amount} currency={t.currency} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Daily spending */}
      {expense > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
          <h2 className="font-semibold text-ink mb-3">Daily spending</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <p className="text-xs text-muted">Average / day</p>
              <p className="text-sm font-semibold text-ink font-numeric">{money(avgPerDay)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Highest day</p>
              <p className="text-sm font-semibold text-ink font-numeric">
                {peakDay.spent > 0 ? `${money(peakDay.spent)} · ${peakDay.day} ${monthLabel(month, true)}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted">No-spend days</p>
              <p className="text-sm font-semibold text-ink">{noSpendDays}</p>
            </div>
            <div>
              <p className="text-xs text-muted">{projected !== undefined ? 'Projected month-end' : 'Month total'}</p>
              <p className="text-sm font-semibold text-ink font-numeric">{money(projected ?? expense)}</p>
            </div>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily}>
                <CartesianGrid vertical={false} stroke={chart.grid} />
                <XAxis dataKey="day" tick={chart.tick} axisLine={false} tickLine={false} interval={Math.max(0, Math.ceil(daysInMonth / 10) - 1)} />
                <YAxis tick={chart.tick} axisLine={false} tickLine={false} width={44} tickFormatter={(v) => (privacyMode ? '' : compact(Number(v)))} />
                <Tooltip
                  formatter={tooltipMoney}
                  labelFormatter={(d) => `${d} ${monthLabel(month, true)}`}
                  {...chart.tooltip}
                  cursor={{ fill: 'var(--color-surface-hover)' }}
                />
                <Bar dataKey="spent" name="Spent" fill="#f97316" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Largest expenses */}
      {topExpenses.length > 0 && (
        <div className="bg-surface rounded-2xl border border-line p-4 sm:p-6">
          <h2 className="font-semibold text-ink mb-3">Largest expenses</h2>
          <ul className="divide-y divide-line-soft">
            {topExpenses.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink truncate">{t.category}</p>
                  <p className="text-xs text-muted truncate">
                    {formatDate(t.date)}
                    {t.note ? ` · ${t.note}` : ''}
                  </p>
                </div>
                <span className="text-sm font-semibold text-ink font-numeric whitespace-nowrap">
                  <Amount value={t.amount} currency={t.currency} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
