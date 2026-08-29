import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, Scale, ArrowLeftRight, TrendingUp, Target, Download } from 'lucide-react';
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
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import Amount from '../components/Amount';
import LoadingDots from '../components/LoadingDots';
import GoldPriceCard from '../components/GoldPriceCard';
import { ASSET_CLASS_LABELS, formatCurrency, maskPreciseAmount } from '../utils/currency';
import { resolveAssetValues } from '../utils/assetValues';
import { PortfolioPdfReport } from '../components/PortfolioPdfReport';
import { PortfolioExportModal } from '../components/PortfolioExportModal';

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
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [cashflowOpen, setCashflowOpen] = useState(false);
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const allGoals = useGoalsStore((s) => s.goals);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const sipValuesAttempted = useLivePricesStore((s) => s.sipValuesAttempted);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const assetsServerConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  const liabilitiesServerConfirmed = useSyncStatusStore((s) => s.liabilitiesServerConfirmed);
  const transactionsServerConfirmed = useSyncStatusStore((s) => s.transactionsServerConfirmed);
  const goalsServerConfirmed = useSyncStatusStore((s) => s.goalsServerConfirmed);
  // Assets/liabilities loading from the server isn't the whole picture — if
  // any asset is priced live (a stock/fund symbol, or a linked SIP), Net
  // Worth also has to wait for a real price before showing a number.
  // Two ways to satisfy that: this session already fetched one (pricesAttempted),
  // or we already have a real price cached locally from last time (persisted
  // in livePricesStore) — in which case there's no need to make the person
  // wait out a fresh network round-trip just to show a number that will very
  // likely be the same; it shows instantly and the background refresh
  // corrects it silently if anything actually changed.
  const liveEquityAssets = allAssets.filter((a) => a.symbol && a.quantity && a.quantity > 0);
  const hasLivePriced = liveEquityAssets.length > 0;
  const pricesCached =
    hasLivePriced && liveEquityAssets.every((a) => livePrices[a.symbol!.toUpperCase()] !== undefined);
  const sipLinkedAssets = allAssets.filter(
    (a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol)
  );
  const hasSipLinked = sipLinkedAssets.length > 0;
  const sipCached = hasSipLinked && sipLinkedAssets.every((a) => sipValues[a.symbol!.trim()] !== undefined);
  const netWorthReady =
    assetsServerConfirmed &&
    liabilitiesServerConfirmed &&
    (!hasLivePriced || pricesAttempted || pricesCached) &&
    (!hasSipLinked || sipValuesAttempted || sipCached);

  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  // "All / Household" (activeProfileId === null) shows everything, unfiltered —
  // this keeps single-profile accounts working exactly as before. Switching to
  // a specific member only shows what's tagged to them.
  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const liabilities = activeProfileId
    ? allLiabilities.filter((l) => l.profileId === activeProfileId)
    : allLiabilities;
  const transactions = activeProfileId
    ? allTransactions.filter((t) => t.profileId === activeProfileId)
    : allTransactions;
  const goals = activeProfileId ? allGoals.filter((g) => g.profileId === activeProfileId) : allGoals;

  const totalAssets = assets.reduce(
    (s, a) => s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value,
    0
  );
  const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
  const netWorth = totalAssets - totalLiabilities;

  const investedAssetsTotal = assets.reduce(
    (s, a) => s + (resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).invested ?? a.value),
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
  // Whether "does this person actually have any wealth/cashflow/goals data"
  // can be trusted yet, as opposed to just reflecting an offline cache that
  // hasn't finished loading. If the (unfiltered, all-profiles) collection
  // already has items, we already know the true answer regardless of cache
  // state — no need to wait. Otherwise, wait for the server to actually
  // confirm the collection is empty before treating "0 items" as real
  // rather than "haven't loaded yet". That distinction matters most on a
  // slow mobile connection, where the loading window is long enough to see.
  const wealthDataKnown =
    allAssets.length > 0 || allLiabilities.length > 0 || (assetsServerConfirmed && liabilitiesServerConfirmed);
  const cashflowDataKnown = allTransactions.length > 0 || transactionsServerConfirmed;
  const goalsDataKnown = allGoals.length > 0 || goalsServerConfirmed;
  const hasWealth = assets.length > 0 || liabilities.length > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Welcome back! Here's your wealth overview.</p>
        </div>
        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-lg transition-colors shadow-sm"
          title="Export portfolio as PDF"
        >
          <Download size={16} />
          Export Portfolio
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Net Worth · <span className="text-slate-400">₹ INR</span>
          </p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500 flex items-center gap-1.5 mt-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live prices update every 60 seconds
          </p>
          {!wealthDataKnown ? (
            <div className="mt-3 h-11 sm:h-12 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3">
              <LoadingDots />
            </div>
          ) : hasWealth ? (
            !netWorthReady ? (
              <div className="mt-3 h-11 sm:h-12 flex items-center gap-2 rounded-lg bg-slate-100 dark:bg-slate-800 px-3">
                <LoadingDots />
                <span className="text-xs text-slate-400 dark:text-slate-500">Fetching live prices…</span>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2.5 flex-wrap mt-2">
                  <span className="font-hero-numeric text-4xl sm:text-5xl text-slate-900 dark:text-white break-words animate-value-in">
                    {maskPreciseAmount(netWorth, 'INR', privacyMode)}
                  </span>
                  {investedAssetsTotal > 0 && (
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
                <MiniTrend isPositive={netWorthPnl >= 0} />
              </>
            )
          ) : (
            <>
              <span className="font-hero-numeric text-4xl sm:text-5xl text-slate-900 dark:text-white block mt-2 break-words">
                {maskPreciseAmount(0, 'INR', privacyMode)}
              </span>
              <Link to="/wealth" className="text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline mt-2 inline-block">
                Take your first snapshot →
              </Link>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
            Invested · <span className="text-slate-400">₹ INR</span>
          </p>
          {/* Invested is pure cost-basis (qty × avg cost, or the SIP schedule) —
              it never needs a live price fetch, so once we know whether this
              account has wealth data at all (wealthDataKnown, shared with the
              Net Worth card alongside it), there's no further reason to gate
              it behind a loading state; it just renders whatever's current. */}
          {!wealthDataKnown ? (
            <div className="mt-3 h-11 sm:h-12 flex items-center rounded-lg bg-slate-100 dark:bg-slate-800 px-3">
              <LoadingDots />
            </div>
          ) : (
            <span className="font-hero-numeric text-4xl sm:text-5xl text-slate-900 dark:text-white block mt-2 break-words animate-value-in">
              {maskPreciseAmount(hasWealth ? investedAssetsTotal : 0, 'INR', privacyMode)}
            </span>
          )}
        </div>
      </div>

      <GoldPriceCard />

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        {/* The whole header row toggles — not just the tiny chevron+label —
           and padding lives here on the clickable row itself (not on the
           outer card), so there's no dead padding gutter around the edges
           that silently swallows clicks. RangePills gets its own
           stopPropagation wrapper since its 7D/30D/90D buttons need to work
           independently without also toggling the card. */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={cashflowOpen}
          onClick={() => setCashflowOpen((o) => !o)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setCashflowOpen((o) => !o);
            }
          }}
          className="flex items-center justify-between gap-3 p-6 cursor-pointer select-none"
        >
          <span className="flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
            {cashflowOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Cashflow</span>
          </span>
          <div onClick={(e) => e.stopPropagation()}>
            <RangePills />
          </div>
        </div>
        {cashflowOpen && (
          <div className="px-6 pb-6">
            {hasCashflow ? (
              <div className="grid grid-cols-2 gap-4">
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
              <div className="text-center">
                <p className="text-slate-400 text-sm mb-3">No income or spending logged in this window.</p>
                <span className="text-sm font-medium text-brand-700 dark:text-brand-300">
                  <Link to="/transactions" className="hover:underline">
                    Add income →
                  </Link>
                  <span className="text-slate-300 mx-1">·</span>
                  <Link to="/transactions" className="hover:underline">
                    Add expense →
                  </Link>
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      <Section
        title="Wealth"
        icon={Scale}
        iconColor="text-indigo-500"
        summary={netWorthReady ? <Amount value={netWorth} /> : <SummarySkeleton />}
        to="/wealth"
      >
        <WealthSummary assets={assets} liabilities={liabilities} totalAssets={totalAssets} totalLiabilities={totalLiabilities} />
      </Section>

      <Section
        title="Cashflow"
        icon={ArrowLeftRight}
        iconColor="text-violet-500"
        summary={cashflowDataKnown ? <Amount value={monthIncome - monthExpense} /> : <SummarySkeleton />}
        to="/transactions"
      >
        <CashflowSummary income={monthIncome} expense={monthExpense} transactions={transactions} />
      </Section>

      <Section
        title="Investments"
        icon={TrendingUp}
        iconColor="text-brand-600"
        summary={wealthDataKnown ? <Amount value={totalInvestments} /> : <SummarySkeleton />}
        to="/wealth?tab=assets"
      >
        <InvestmentsSummary investments={investments} />
      </Section>

      <Section title="Goals" icon={Target} iconColor="text-orange-500" summary={goalsDataKnown ? `${goals.length}` : <SummarySkeleton />} to="/essentials?tab=goals">
        <GoalsSummary goals={goals} netWorth={netWorthReady ? netWorth : 0} />
      </Section>

      <PortfolioExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
      />

      {/* Hidden report component - used only for PDF generation */}
      <div style={{ display: 'none' }}>
        <PortfolioPdfReport hideInPrint={false} />
      </div>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <span className="inline-flex items-center h-4 align-middle">
      <LoadingDots />
    </span>
  );
}

function Section({
  title,
  icon: Icon,
  iconColor = 'text-brand-600',
  summary,
  to,
  children,
}: {
  title: string;
  icon: typeof Scale;
  iconColor?: string;
  summary: React.ReactNode;
  to?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
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
      {open && (
        <div className="px-6 pb-6">
          {children}
          {to && (
            <button
              onClick={() => navigate(to)}
              className="mt-4 flex items-center gap-1 text-sm font-medium text-brand-700 dark:text-brand-300 hover:underline"
            >
              Go to {title} to add or edit <ChevronRight size={14} />
            </button>
          )}
        </div>
      )}
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
    return <EmptyState text="Add assets or liabilities to see your wealth breakdown." to="/wealth" cta="Add asset or liability →" />;
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
    return <EmptyState text="Log income or expenses in Money to see your cashflow here." to="/transactions" cta="Add income or expense →" />;
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
            <Bar dataKey="income" fill="#16a34a" radius={[6, 6, 0, 0]} />
            <Bar dataKey="expense" fill="#f59e0b" radius={[6, 6, 0, 0]} />
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
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);

  if (investments.length === 0) {
    return (
      <EmptyState
        text="Add equity, mutual fund, or crypto assets in Wealth to see them here."
        to="/wealth?tab=assets"
        cta="Add investment →"
      />
    );
  }
  const sorted = [...investments].sort((a, b) => b.value - a.value);
  const visible = sorted.slice(0, 4);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visible.map((a) => {
          const { invested } = resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram);
          return (
            <div key={a.id} className="border border-slate-100 dark:border-slate-800 rounded-xl p-4">
              <p className="font-medium text-slate-800 dark:text-slate-100 uppercase">{a.name}</p>
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

function GoalsSummary({
  goals,
  netWorth,
}: {
  goals: ReturnType<typeof useGoalsStore.getState>['goals'];
  netWorth: number;
}) {
  if (goals.length === 0) {
    return <EmptyState text="Set a goal in Essentials to track your progress here." to="/essentials?tab=goals" cta="Add goal →" />;
  }
  const current = Math.max(0, netWorth);
  return (
    <div className="space-y-3">
      {goals.slice(0, 4).map((g) => {
        const pct = g.targetAmount > 0 ? Math.min(100, Math.round((current / g.targetAmount) * 100)) : 0;
        return (
          <div key={g.id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-slate-700 dark:text-slate-200 uppercase">{g.name}</span>
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

/** Small sparkline under the Net Worth figure. Direction and color follow
 * the actual overall P&L instead of always trending up, so a portfolio
 * that's down shows a gently declining red line rather than a misleadingly
 * cheerful green climb. */
function MiniTrend({ isPositive }: { isPositive: boolean }) {
  const points = isPositive
    ? '0,44 40,40 80,36 120,30 160,22 200,16 240,6'
    : '0,10 40,15 80,20 120,26 160,32 200,37 240,42';
  const stroke = isPositive ? 'var(--color-brand-600)' : '#ef4444';
  return (
    <div className="mt-3 h-14">
      <svg viewBox="0 0 240 56" className="w-full h-full" preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
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

function EmptyState({ text, to, cta }: { text: string; to?: string; cta?: string }) {
  return (
    <div className="py-8 flex flex-col items-center justify-center gap-2 text-sm text-slate-400 text-center px-6">
      <span>{text}</span>
      {to && (
        <Link to={to} className="text-brand-700 dark:text-brand-300 font-medium hover:underline">
          {cta ?? 'Add now →'}
        </Link>
      )}
    </div>
  );
}
