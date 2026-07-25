import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, Scale, ArrowLeftRight, TrendingUp, Target } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useGoalsStore } from '../store/goalsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import Amount from '../components/Amount';
import { ASSET_CLASS_LABELS, formatCurrency, maskPreciseAmount } from '../utils/currency';
import { resolveAssetValues } from '../utils/assetValues';

const INVESTMENT_CLASSES = new Set([
  'stock',
  'etf',
  'equity_mutual_fund',
  'index_fund',
  'hybrid_mutual_fund',
  'sip',
  'international_equity',
  'ipo_pre_ipo',
  'esop_rsu',
  'equity_other',
  'crypto_coin',
  'nft',
]);

export default function Dashboard() {
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const transactions = useTransactionsStore((s) => s.transactions);
  const goals = useGoalsStore((s) => s.goals);
  const livePrices = useLivePricesStore((s) => s.prices);
  const privacyMode = useUiStore((s) => s.privacyMode);

  const totalAssets = assets.reduce(
    (s, a) => s + resolveAssetValues(a, livePrices).value,
    0
  );
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const investedAssetsTotal = assets.reduce(
    (s, a) => s + (resolveAssetValues(a, livePrices).invested ?? a.value),
    0
  );
  const netWorthPnl = totalAssets - investedAssetsTotal;
  const netWorthPnlPercent = investedAssetsTotal > 0 ? (netWorthPnl / investedAssetsTotal) * 100 : 0;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthIncome = transactions
    .filter((t) => t.type === 'income' && t.date.startsWith(thisMonth))
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = transactions
    .filter((t) => t.type === 'expense' && t.date.startsWith(thisMonth))
    .reduce((s, t) => s + t.amount, 0);

  const investments = assets.filter((a) => INVESTMENT_CLASSES.has(a.assetClass));
  const totalInvestments = investments.reduce((s, a) => s + a.value, 0);
  const hasCashflow = transactions.length > 0;
  const hasWealth = assets.length > 0 || liabilities.length > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Net Worth · <span className="text-slate-400">₹ INR</span>
          </p>
          {hasWealth ? (
            <>
              <div className="flex items-center gap-2.5 flex-wrap mt-2">
                <span className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white break-words">
                  {maskPreciseAmount(netWorth, 'INR', privacyMode)}
                </span>
                {!privacyMode && investedAssetsTotal > 0 && (
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                      netWorthPnl >= 0
                        ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-300'
                        : 'bg-red-50 dark:bg-red-900/30 text-red-500'
                    }`}
                  >
                    {netWorthPnl >= 0 ? '+' : ''}
                    {netWorthPnlPercent.toFixed(1)}% overall
                  </span>
                )}
              </div>
              <MiniTrend />
            </>
          ) : (
            <>
              <div className="mt-4 mb-8">
                <MaskedDots />
              </div>
              <a href="#wealth" className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline">
                Take your first snapshot →
              </a>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Invested · <span className="text-slate-400">₹ INR</span>
          </p>
          {hasWealth ? (
            <span className="font-display text-3xl sm:text-4xl font-semibold text-slate-900 dark:text-white block mt-2 break-words">
              {maskPreciseAmount(investedAssetsTotal, 'INR', privacyMode)}
            </span>
          ) : (
            <div className="mt-4 mb-8">
              <MaskedDots />
            </div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cashflow</p>
          <RangePills />
        </div>
        {hasCashflow ? (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div>
              <p className="text-sm text-slate-500">Income</p>
              <Amount value={monthIncome} className="font-display text-2xl font-semibold text-brand-700 dark:text-brand-300 block" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Expenses</p>
              <Amount value={monthExpense} className="font-display text-2xl font-semibold text-orange-500 block" />
            </div>
          </div>
        ) : (
          <div className="mt-6 text-center">
            <p className="text-slate-400 text-sm mb-3">No income or spending logged in this window.</p>
            <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
              Add income → <span className="text-slate-300 mx-1">·</span> Add expense →
            </span>
          </div>
        )}
      </div>

      <Section title="Wealth" icon={Scale} iconColor="text-indigo-500" summary={<Amount value={netWorth} />}>
        <WealthSummary assets={assets} liabilities={liabilities} totalAssets={totalAssets} totalLiabilities={totalLiabilities} />
      </Section>

      <Section
        title="Cashflow"
        icon={ArrowLeftRight}
        iconColor="text-violet-500"
        summary={<Amount value={monthIncome - monthExpense} />}
      >
        <CashflowSummary income={monthIncome} expense={monthExpense} transactions={transactions} />
      </Section>

      <Section title="Investments" icon={TrendingUp} iconColor="text-brand-600" summary={<Amount value={totalInvestments} />}>
        <InvestmentsSummary investments={investments} />
      </Section>

      <Section title="Goals" icon={Target} iconColor="text-orange-500" summary={`${goals.length}`}>
        <GoalsSummary goals={goals} />
      </Section>
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  iconColor = 'text-brand-600',
  summary,
  children,
}: {
  title: string;
  icon: typeof Scale;
  iconColor?: string;
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-6 py-4"
      >
        <div className="flex items-center gap-2 text-slate-800 dark:text-slate-100">
          {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          <Icon size={18} className={iconColor} />
          <span className="font-semibold text-base">{title}</span>
        </div>
        <span className="font-semibold text-slate-900 dark:text-white">{summary}</span>
      </button>
      {open && <div className="px-6 pb-6">{children}</div>}
    </div>
  );
}

function WealthSummary({
  assets,
  liabilities,
  totalAssets,
  totalLiabilities,
}: {
  assets: ReturnType<typeof useAssetsStore.getState>['assets'];
  liabilities: ReturnType<typeof useLiabilitiesStore.getState>['liabilities'];
  totalAssets: number;
  totalLiabilities: number;
}) {
  const total = totalAssets + totalLiabilities;
  const assetPct = total > 0 ? Math.round((totalAssets / total) * 100) : 100;

  if (assets.length === 0 && liabilities.length === 0) {
    return <EmptyState text="Add assets or liabilities to see your wealth breakdown." />;
  }

  return (
    <div className="space-y-4">
      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
        <div className="h-full bg-brand-600" style={{ width: `${assetPct}%` }} />
        <div className="h-full bg-red-400" style={{ width: `${100 - assetPct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-slate-500">Assets ({assetPct}%)</p>
          <Amount value={totalAssets} className="text-lg font-semibold text-slate-900 dark:text-white" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Liabilities ({100 - assetPct}%)</p>
          <Amount value={totalLiabilities} className="text-lg font-semibold text-slate-900 dark:text-white" />
        </div>
      </div>
    </div>
  );
}

function CashflowSummary({
  income,
  expense,
  transactions,
}: {
  income: number;
  expense: number;
  transactions: ReturnType<typeof useTransactionsStore.getState>['transactions'];
}) {
  const monthlyTrend = useMemo(() => {
    const map: Record<string, { income: number; expense: number }> = {};
    transactions.forEach((t) => {
      const month = t.date.slice(0, 7);
      if (!map[month]) map[month] = { income: 0, expense: 0 };
      if (t.type === 'income') map[month].income += t.amount;
      else map[month].expense += t.amount;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([month, v]) => ({ month, ...v }));
  }, [transactions]);

  if (transactions.length === 0) {
    return <EmptyState text="Log income or expenses in Money to see your cashflow here." />;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-slate-500">Income this month</p>
          <Amount value={income} className="text-lg font-semibold text-brand-600" />
        </div>
        <div>
          <p className="text-sm text-slate-500">Expenses this month</p>
          <Amount value={expense} className="text-lg font-semibold text-orange-500" />
        </div>
      </div>
      {monthlyTrend.length > 1 && (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={monthlyTrend}>
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} width={60} />
            <Tooltip formatter={(v) => formatCurrency(Number(v))} />
            <Bar dataKey="income" fill="#16a35d" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expense" fill="#f97316" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function InvestmentsSummary({
  investments,
}: {
  investments: ReturnType<typeof useAssetsStore.getState>['assets'];
}) {
  const livePrices = useLivePricesStore((s) => s.prices);
  const privacyMode = useUiStore((s) => s.privacyMode);

  if (investments.length === 0) {
    return (
      <EmptyState text="Add equity, mutual fund, or crypto assets in Wealth to see them here." />
    );
  }
  const sorted = [...investments].sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((a) => {
          const { invested } = resolveAssetValues(a, livePrices);
          return (
            <div key={a.id} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4">
              <p className="font-medium text-slate-800 dark:text-slate-100">{a.name}</p>
              <span className="text-lg font-semibold text-slate-900 dark:text-white block">
                {maskPreciseAmount(
                  invested !== undefined ? invested : a.value,
                  a.currency,
                  privacyMode
                )}
              </span>
              <p className="text-xs text-slate-400 mt-1">{ASSET_CLASS_LABELS[a.assetClass]}</p>
            </div>
          );
        })}
      </div>
      {sorted.length > visible.length && (
        <Link
          to="/wealth"
          className="inline-block text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline"
        >
          View more →
        </Link>
      )}
    </div>
  );
}

function GoalsSummary({ goals }: { goals: ReturnType<typeof useGoalsStore.getState>['goals'] }) {
  if (goals.length === 0) {
    return <EmptyState text="Set a goal in Essentials to track your progress here." />;
  }
  return (
    <div className="space-y-3">
      {goals.slice(0, 4).map((g) => {
        const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
        return (
          <div key={g.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-200">{g.name}</span>
              <span className="text-slate-400">{pct}%</span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full bg-brand-600 rounded-full" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MaskedDots() {
  return (
    <div className="flex gap-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full bg-slate-800 dark:bg-slate-200" />
      ))}
    </div>
  );
}

function MiniTrend() {
  return (
    <div className="mt-3 h-14">
      <svg viewBox="0 0 240 56" className="w-full h-full" preserveAspectRatio="none">
        <polyline
          points="0,44 40,40 80,36 120,30 160,22 200,16 240,6"
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="2.5"
        />
      </svg>
    </div>
  );
}

function RangePills() {
  const [active, setActive] = useState<'7D' | '30D' | '90D'>('30D');
  return (
    <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
      {(['7D', '30D', '90D'] as const).map((r) => (
        <button
          key={r}
          onClick={() => setActive(r)}
          className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors ${
            active === r
              ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="py-8 flex items-center justify-center text-sm text-slate-400 text-center px-6">
      {text}
    </div>
  );
}
