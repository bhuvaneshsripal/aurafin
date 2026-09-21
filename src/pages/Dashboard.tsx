import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, Wallet, Receipt, Target, TrendingUp } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useGoalsStore } from '../store/goalsStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import GoldPriceCard from '../components/GoldPriceCard';
import { PortfolioPdfReport } from '../components/PortfolioPdfReport';
import { PortfolioExportModal } from '../components/PortfolioExportModal';
import { toIsoDate, toIsoMonth } from '../utils/date';
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  SegmentedControl,
  StatCard,
  Table,
  TableContainer,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  Skeleton,
  chart,
} from '../components/ui';
import {
  ASSET_CLASS_LABELS,
  formatAxisAmount,
  formatPercentMagnitude,
  formatSignedCurrency,
  maskAmount,
} from '../utils/currency';
import { ASSET_CLASS_TO_CATEGORY } from '../utils/taxonomy';
import { resolveAssetValues } from '../utils/assetValues';
import type { Goal, Snapshot, Transaction } from '../types';

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

  const thisMonth = toIsoMonth();
  const monthIncome = transactions
    .filter((t) => t.type === 'income' && t.date.startsWith(thisMonth))
    .reduce((s, t) => s + t.amount, 0);
  const monthExpense = transactions
    .filter((t) => t.type === 'expense' && t.date.startsWith(thisMonth))
    .reduce((s, t) => s + t.amount, 0);

  const investments = assets.filter((a) => INVESTMENT_CLASSES.has(a.assetClass));
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


  // ---- Derived for the new visual sections (all read-only views of the
  // ---- same numbers computed above; nothing here changes a calculation).
  const money = (v: number) => maskAmount(v, 'INR', privacyMode, { fractionDigits: 0 });
  const signedMoney = (v: number) => (privacyMode ? '••••••' : formatSignedCurrency(v, 'INR', 0));
  const ready = wealthDataKnown && (!hasWealth || netWorthReady);

  // Allocation by category — same rule as the Wealth → Allocation tab:
  // holdings flagged "exclude from allocation" are left out.
  const allocation = useMemo(() => {
    const byCat = new Map<string, { key: string; label: string; color: string; value: number }>();
    for (const a of assets) {
      if (a.excludeFromAllocation) continue;
      const { value } = resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram);
      if (value <= 0) continue;
      const cat = ASSET_CLASS_TO_CATEGORY[a.assetClass];
      const key = cat?.key ?? 'other';
      const cur = byCat.get(key) ?? { key, label: cat?.label ?? 'Other', color: cat?.color ?? '#64748b', value: 0 };
      cur.value += value;
      byCat.set(key, cur);
    }
    return [...byCat.values()].sort((x, y) => y.value - x.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, livePrices, sipValues, liveGoldPricePerGram]);

  const topHoldings = useMemo(
    () =>
      investments
        .map((a) => ({ asset: a, ...resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram) }))
        .sort((x, y) => y.value - x.value)
        .slice(0, 5),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [investments, livePrices, sipValues, liveGoldPricePerGram]
  );

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
      .map(([month, v]) => ({ month, label: monthLabel(month), ...v }));
  }, [transactions]);

  const recentTransactions = useMemo(
    () => [...transactions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6),
    [transactions]
  );

  const savedThisMonth = monthIncome - monthExpense;
  const savingsRate = monthIncome > 0 ? (savedThisMonth / monthIncome) * 100 : null;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Overview"
        description="Your net worth, portfolio and cash flow at a glance."
        meta={
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live prices update every 60 seconds
          </p>
        }
        actions={
          <Button variant="secondary" leftIcon={<FileText size={15} />} onClick={() => setExportModalOpen(true)}>
            Export report
          </Button>
        }
      />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          dense
          label="Net worth"
          loading={!ready}
          value={money(hasWealth ? netWorth : 0)}
          sublabel={hasWealth ? 'Assets minus liabilities' : <Link to="/wealth" className="text-primary-ink font-medium hover:underline">Add your first asset</Link>}
        />
        <StatCard
          dense
          label="Total invested"
          loading={!wealthDataKnown}
          value={money(hasWealth ? investedAssetsTotal : 0)}
          sublabel="Cost basis"
        />
        <StatCard
          dense
          label="Profit / loss"
          loading={!ready}
          tone={!hasWealth || investedAssetsTotal <= 0 ? 'default' : netWorthPnl >= 0 ? 'positive' : 'negative'}
          value={hasWealth ? signedMoney(netWorthPnl) : money(0)}
          delta={
            hasWealth && investedAssetsTotal > 0 && !privacyMode
              ? { value: formatPercentMagnitude(netWorthPnlPercent), positive: netWorthPnl >= 0 }
              : undefined
          }
          sublabel="vs. invested"
        />
      </div>

      {/* Performance + allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <PerformanceCard privacyMode={privacyMode} />
        </div>
        <AllocationCard
          data={allocation}
          total={totalAssets}
          loading={!ready}
          hasWealth={hasWealth}
          privacyMode={privacyMode}
        />
      </div>

      {/* Cash flow + goals */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CashflowCard
            loading={!cashflowDataKnown}
            income={monthIncome}
            expense={monthExpense}
            saved={savedThisMonth}
            savingsRate={savingsRate}
            trend={monthlyTrend}
            hasTransactions={transactions.length > 0}
            privacyMode={privacyMode}
          />
        </div>
        <GoalsCard
          goals={goals}
          netWorth={netWorthReady ? netWorth : 0}
          loading={!goalsDataKnown}
          privacyMode={privacyMode}
        />
      </div>

      {/* Recent transactions + top holdings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <RecentTransactionsCard rows={recentTransactions} loading={!cashflowDataKnown} privacyMode={privacyMode} />
        </div>
        <TopHoldingsCard rows={topHoldings} loading={!ready} privacyMode={privacyMode} />
      </div>

      <GoldPriceCard />

      {/* PDF Export Modal and Report */}
      <PortfolioExportModal open={exportModalOpen} onClose={() => setExportModalOpen(false)} />

      {/* Hidden report component - used only for PDF generation */}
      <div style={{ display: 'none' }}>
        <PortfolioPdfReport hideInPrint={false} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

function shortDate(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function ChartTooltip({
  active,
  payload,
  label,
  privacyMode,
  labels,
}: {
  active?: boolean;
  payload?: { name?: string; dataKey?: string | number; value?: number; color?: string }[];
  label?: string;
  privacyMode: boolean;
  labels?: Record<string, string>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 shadow-lg text-xs">
      <p className="text-muted font-medium mb-1">{label}</p>
      {payload.map((p) => (
        <p key={String(p.dataKey)} className="flex items-center gap-2 text-ink">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted">{labels?.[String(p.dataKey)] ?? p.name}</span>
          <span className="font-numeric ml-auto pl-3">
            {privacyMode ? '••••••' : maskAmount(Number(p.value ?? 0), 'INR', false, { fractionDigits: 0 })}
          </span>
        </p>
      ))}
    </div>
  );
}

type Range = '3M' | '6M' | '1Y' | 'ALL';

function PerformanceCard({ privacyMode }: { privacyMode: boolean }) {
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const [range, setRange] = useState<Range>('ALL');

  const data = useMemo(() => {
    const sorted = [...snapshots].sort((a: Snapshot, b: Snapshot) => a.date.localeCompare(b.date));
    if (range === 'ALL') return sorted;
    const months = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const iso = toIsoDate(cutoff);
    return sorted.filter((s) => s.date >= iso);
  }, [snapshots, range]);

  const first = data[0];
  const last = data[data.length - 1];
  const change = first && last ? last.netWorth - first.netWorth : 0;
  const changePct = first && first.netWorth > 0 ? (change / first.netWorth) * 100 : 0;
  // Line/fill follow the same red-when-down convention as the change
  // figure above it, instead of always drawing green even on a losing
  // stretch.
  const isDown = change < 0;
  const lineColor = isDown ? chart.negative : chart.primary;
  const fillColor = isDown ? chart.negativeSoft : chart.primarySoft;

  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Portfolio performance"
        description={
          data.length >= 2 ? (
            <span>
              Net worth across {data.length} snapshots ·{' '}
              <span className={change >= 0 ? 'text-positive font-medium' : 'text-negative font-medium'}>
                {privacyMode ? '••••••' : `${formatSignedCurrency(change, 'INR', 0)} (${formatPercentMagnitude(changePct, 1)})`}
              </span>
            </span>
          ) : (
            'Net worth over time, from your saved snapshots'
          )
        }
        actions={
          <SegmentedControl<Range>
            size="sm"
            value={range}
            onChange={setRange}
            items={[
              { key: '3M', label: '3M' },
              { key: '6M', label: '6M' },
              { key: '1Y', label: '1Y' },
              { key: 'ALL', label: 'All' },
            ]}
          />
        }
      />
      {data.length >= 2 ? (
        <div className="h-[248px] -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) =>
                  new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })
                }
                tick={chart.tick}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => (privacyMode ? '' : formatAxisAmount(v))}
                tick={chart.tick}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={['auto', 'auto']}
              />
              <Tooltip
                cursor={chart.tooltip.cursor}
                content={(p) => (
                  <ChartTooltip
                    {...(p as object)}
                    label={p.label ? shortDate(String(p.label)) : ''}
                    privacyMode={privacyMode}
                    labels={{ netWorth: 'Net worth' }}
                  />
                )}
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke={lineColor}
                strokeWidth={2}
                fill={fillColor}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--color-surface)', fill: lineColor }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <EmptyState
          compact
          icon={<TrendingUp size={18} />}
          title="Not enough history yet"
          description="Use Add → Snapshot to record your net worth. Two or more snapshots draw this chart."
        />
      )}
    </Card>
  );
}

function AllocationCard({
  data,
  total,
  loading,
  hasWealth,
  privacyMode,
}: {
  data: { key: string; label: string; color: string; value: number }[];
  total: number;
  loading: boolean;
  hasWealth: boolean;
  privacyMode: boolean;
}) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Asset allocation"
        description="By asset category"
        actions={
          <Link to="/wealth?tab=allocation" className="text-[13px] font-medium text-primary-ink hover:underline">
            Details
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-36 w-36 rounded-full mx-auto" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      ) : !hasWealth || data.length === 0 ? (
        <EmptyState
          compact
          icon={<Wallet size={18} />}
          title="No assets yet"
          description="Add holdings to see how your wealth is spread out."
          action={
            <Link to="/wealth" className="text-[13px] font-medium text-primary-ink hover:underline">
              Add an asset
            </Link>
          }
        />
      ) : (
        <div>
          <div className="relative h-[168px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius={54}
                  outerRadius={78}
                  paddingAngle={2}
                  stroke="none"
                  isAnimationActive={false}
                >
                  {data.map((d) => (
                    <Cell key={d.key} fill={d.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-muted">Total</span>
              <span className="font-numeric text-[15px] font-semibold text-ink">
                {maskAmount(total, 'INR', privacyMode, { fractionDigits: 0 })}
              </span>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {data.slice(0, 6).map((d) => (
              <li key={d.key} className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
                <span className="text-ink-2 truncate flex-1">{d.label}</span>
                <span className="font-numeric font-medium text-ink">{sum > 0 ? ((d.value / sum) * 100).toFixed(1) : '0.0'}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function CashflowCard({
  loading,
  income,
  expense,
  saved,
  savingsRate,
  trend,
  hasTransactions,
  privacyMode,
}: {
  loading: boolean;
  income: number;
  expense: number;
  saved: number;
  savingsRate: number | null;
  trend: { month: string; label: string; income: number; expense: number }[];
  hasTransactions: boolean;
  privacyMode: boolean;
}) {
  const m = (v: number) => maskAmount(v, 'INR', privacyMode, { fractionDigits: 0 });
  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Income & expenses"
        description="This month, with the last six months for context"
        actions={
          <Link to="/transactions" className="text-[13px] font-medium text-primary-ink hover:underline">
            View all
          </Link>
        }
      />
      {loading ? (
        <Skeleton className="h-48 w-full" />
      ) : !hasTransactions ? (
        <EmptyState
          compact
          icon={<Receipt size={18} />}
          title="No income or spending logged yet"
          description="Log an income or expense with Add to see your cash flow here."
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-xs text-muted">Income</p>
              <p className="font-numeric text-base font-semibold text-positive mt-0.5">{m(income)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Expenses</p>
              <p className="font-numeric text-base font-semibold text-ink mt-0.5">{m(expense)}</p>
            </div>
            <div>
              <p className="text-xs text-muted">Saved</p>
              <p className={`font-numeric text-base font-semibold mt-0.5 ${saved >= 0 ? 'text-ink' : 'text-negative'}`}>
                {m(saved)}
                {savingsRate !== null && !privacyMode && (
                  <span className="ml-1.5 text-xs font-medium text-muted">{savingsRate.toFixed(0)}%</span>
                )}
              </p>
            </div>
          </div>
          {trend.length > 1 && (
            <div className="h-[190px] -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3}>
                  <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => (privacyMode ? '' : formatAxisAmount(v))}
                    tick={chart.tick}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-surface-hover)' }}
                    content={(p) => (
                      <ChartTooltip
                        {...(p as object)}
                        privacyMode={privacyMode}
                        labels={{ income: 'Income', expense: 'Expenses' }}
                      />
                    )}
                  />
                  <Bar dataKey="income" fill={chart.primary} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="expense" fill="#d6b06b" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function GoalsCard({
  goals,
  netWorth,
  loading,
  privacyMode,
}: {
  goals: Goal[];
  netWorth: number;
  loading: boolean;
  privacyMode: boolean;
}) {
  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Goals"
        description={goals.length > 0 ? `${goals.length} ${goals.length === 1 ? 'goal' : 'goals'} in progress` : undefined}
        actions={
          <Link to="/essentials?tab=goals" className="text-[13px] font-medium text-primary-ink hover:underline">
            Manage
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : goals.length === 0 ? (
        <EmptyState
          compact
          icon={<Target size={18} />}
          title="No goals yet"
          description="Set a target to track your progress here."
          action={
            <Link to="/essentials?tab=goals" className="text-[13px] font-medium text-primary-ink hover:underline">
              Add a goal
            </Link>
          }
        />
      ) : (
        <ul className="space-y-4">
          {goals.slice(0, 4).map((g) => {
            // Same rule as the Goals tab: every goal's progress follows live
            // net worth (never a stale manual entry).
            const current = Math.max(0, netWorth);
            const pct = g.targetAmount > 0 ? Math.min(100, Math.max(0, Math.round((current / g.targetAmount) * 100))) : 0;
            return (
              <li key={g.id}>
                <div className="flex items-baseline justify-between gap-3 text-sm mb-1.5">
                  <span className="font-medium text-ink truncate">{g.name}</span>
                  <span className="font-numeric text-xs font-medium text-muted shrink-0">{pct}%</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-muted mt-1.5 font-numeric font-normal">
                  {maskAmount(current, g.currency, privacyMode, { fractionDigits: 0 })} of{' '}
                  {maskAmount(g.targetAmount, g.currency, privacyMode, { fractionDigits: 0 })}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function RecentTransactionsCard({
  rows,
  loading,
  privacyMode,
}: {
  rows: Transaction[];
  loading: boolean;
  privacyMode: boolean;
}) {
  return (
    <Card padding="none" className="h-full overflow-hidden">
      <CardHeader
        padded
        divided
        title="Recent transactions"
        actions={
          <Link to="/transactions" className="text-[13px] font-medium text-primary-ink hover:underline">
            View all
          </Link>
        }
      />
      {loading ? (
        <div className="p-5 space-y-3">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState compact icon={<Receipt size={18} />} title="No transactions yet" description="Income and expenses you log will appear here." />
      ) : (
        <TableContainer>
          <Table>
            <THead>
              <tr>
                <Th>Date</Th>
                <Th>Category</Th>
                <Th className="hidden sm:table-cell">Note</Th>
                <Th align="right">Amount</Th>
              </tr>
            </THead>
            <TBody>
              {rows.map((t) => (
                <Tr key={t.id}>
                  <Td className="text-muted whitespace-nowrap">{shortDate(t.date)}</Td>
                  <Td className="font-medium">{t.category}</Td>
                  <Td className="hidden sm:table-cell text-muted max-w-[16rem] truncate">{t.note || '—'}</Td>
                  <Td numeric className={t.type === 'income' ? 'text-positive' : undefined}>
                    {privacyMode
                      ? '••••••'
                      : `${t.type === 'income' ? '+' : '−'}${maskAmount(t.amount, t.currency, false, { fractionDigits: 0 })}`}
                  </Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        </TableContainer>
      )}
    </Card>
  );
}

function TopHoldingsCard({
  rows,
  loading,
  privacyMode,
}: {
  rows: (ReturnType<typeof resolveAssetValues> & { asset: ReturnType<typeof useAssetsStore.getState>['assets'][number] })[];
  loading: boolean;
  privacyMode: boolean;
}) {
  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Top holdings"
        description="By current value"
        actions={
          <Link to="/wealth?tab=assets" className="text-[13px] font-medium text-primary-ink hover:underline inline-flex items-center gap-0.5">
            All assets <ArrowUpRight size={13} />
          </Link>
        }
      />
      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          compact
          icon={<TrendingUp size={18} />}
          title="No investments yet"
          description="Stocks, funds and crypto you add show up here."
        />
      ) : (
        <ul className="divide-y divide-line-soft -my-2">
          {rows.map(({ asset, value, pnlPercent }) => (
            <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">{asset.name}</p>
                <p className="text-xs text-muted truncate">{ASSET_CLASS_LABELS[asset.assetClass]}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="font-numeric text-sm font-semibold text-ink">
                  {maskAmount(value, asset.currency, privacyMode, { fractionDigits: 0 })}
                </p>
                {pnlPercent !== undefined && !privacyMode ? (
                  <p className={`font-numeric text-xs font-medium ${pnlPercent >= 0 ? 'text-positive' : 'text-negative'}`}>
                    {pnlPercent >= 0 ? '+' : '−'}
                    {formatPercentMagnitude(pnlPercent, 1)}
                  </p>
                ) : (
                  <Badge className="invisible">–</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
