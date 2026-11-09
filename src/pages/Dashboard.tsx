import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { usePinnedTooltip, isTouchDevice, type ChartClickState } from '../hooks/usePinnedTooltip';
import PinnedChartTooltip from '../components/PinnedChartTooltip';
import { isFullySold, computePortfolioPnl } from '../utils/investmentPnl';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Wallet, Receipt, Target, TrendingUp } from 'lucide-react';
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
  ReferenceLine,
  ReferenceDot,
  usePlotArea,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useGoalsStore } from '../store/goalsStore';
import LoadingDots from '../components/LoadingDots';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import GoldPriceCard from '../components/GoldPriceCard';
import { formatDate, formatLocaleDate, toIsoDate, toIsoMonth } from '../utils/date';
import {
  Badge,
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
  ProgressRing,
  ConcentricRings,
  TrendArrow,
  chart,
} from '../components/ui';
import { PriceStaleBanner, PriceUpdatedLine } from '../components/PriceStatus';
import { ASSET_CLASS_LABELS, maskAmount, PRIVACY_DOTS } from '../utils/currency';
import { formatAxisAmount, formatPercentMagnitude, formatSignedCurrency, formatPreciseCurrency } from '../utils/privateFormat';
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
  const transactionsLoaded = useSyncStatusStore((s) => !!s.loadedCollections['transactions']);
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
  const sipLinkedAssets = allAssets.filter(
    (a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol)
  );
  const hasSipLinked = sipLinkedAssets.length > 0;
  // Gold holdings are priced off the live per-gram rate too. Without waiting for it,
  // Net worth first showed the old saved gold value and jumped when the rate arrived.
  const hasLiveGold = allAssets.some((a) => a.assetClass === 'gold' && a.quantity && a.quantity > 0);
  const goldAttempted = useLivePricesStore((s) => s.goldAttempted);
  const goldPriceError = useLivePricesStore((s) => s.goldPriceError);
  const goldReady = !hasLiveGold || liveGoldPricePerGram !== null || goldAttempted || goldPriceError;
  const netWorthReady =
    assetsServerConfirmed &&
    liabilitiesServerConfirmed &&
    (!hasLivePriced || pricesAttempted) &&
    (!hasSipLinked || sipValuesAttempted) &&
    goldReady;

  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  // "All / Household" (activeProfileId === null) shows everything, unfiltered —
  // this keeps single-profile accounts working exactly as before. Switching to
  // a specific member only shows what's tagged to them.
  // Fully sold-out holdings are no longer part of the portfolio (the Wealth
  // page hides them too), so they must not count toward Net worth /
  // Profit-loss here — otherwise the Dashboard disagrees with Wealth.
  // These are memoised on their store arrays: a plain `.filter()` here made a
  // brand-new array on EVERY render, which silently defeated every useMemo
  // below that lists them as a dependency (allocation, top holdings, ...), so
  // they were recomputed on each price tick and each tooltip hover.
  const assets = useMemo(
    () =>
      (activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets).filter(
        (a) => !isFullySold(a)
      ),
    [allAssets, activeProfileId]
  );
  const liabilities = useMemo(
    () => (activeProfileId ? allLiabilities.filter((l) => l.profileId === activeProfileId) : allLiabilities),
    [allLiabilities, activeProfileId]
  );
  const transactions = useMemo(
    () => (activeProfileId ? allTransactions.filter((t) => t.profileId === activeProfileId) : allTransactions),
    [allTransactions, activeProfileId]
  );
  const goals = useMemo(
    () => (activeProfileId ? allGoals.filter((g) => g.profileId === activeProfileId) : allGoals),
    [allGoals, activeProfileId]
  );

  const totalAssets = useMemo(
    () => assets.reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value, 0),
    [assets, livePrices, sipValues, liveGoldPricePerGram]
  );
  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + l.outstanding, 0), [liabilities]);
  const netWorth = totalAssets - totalLiabilities;
  // The history chart is saved for the whole household (snapshots carry no
  // profile), so its live "today" point must be the household total too —
  // otherwise it disagrees with the profile-scoped cards above it.
  const householdNetWorth = useMemo(
    () =>
      allAssets
        .filter((a) => !isFullySold(a))
        .reduce((s, a) => s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value, 0) -
      allLiabilities.reduce((s, l) => s + l.outstanding, 0),
    [allAssets, allLiabilities, livePrices, sipValues, liveGoldPricePerGram]
  );

  // Lifetime view (revealed by the arrow on the Net worth card): money
  // already taken out by selling — fully or partly — and the entire amount
  // ever invested, i.e. what's still invested plus the cost of what was sold.
  const profileAssets = useMemo(
    () => (activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets),
    [allAssets, activeProfileId]
  );
  // Arrow on the Net worth card flips the strip in place:
  //  - Net worth      = current value + total realized profit/loss
  //  - Total invested = currently invested + cost of what was sold
  //  - Profit / loss  = realized profit/loss only (no current/unrealized)
  const [includeSold, setIncludeSold] = useState(false);
  // Profit / loss and return come from the same engine as the Performance
  // page so both screens always show identical numbers.
  const portfolioPnl = useMemo(
    () => computePortfolioPnl(profileAssets, 'INR', livePrices, sipValues, liveGoldPricePerGram),
    [profileAssets, livePrices, sipValues, liveGoldPricePerGram]
  );
  // Anything that is part of Net worth but that the P&L engine does not cost —
  // Cash & Savings (rightly no cost basis), and holdings with no buy history on
  // record — is counted at face value (cost = value, zero P&L). That keeps
  // Total invested reconciled with Net worth (Net worth − Total invested = P&L)
  // instead of silently dropping those holdings from "invested". Same scoping
  // as above: ₹ only, and fully-sold holdings are not part of Net worth.
  const cashBasis = useMemo(() => {
    const costed = new Set(portfolioPnl.active.map((h) => h.asset.id));
    return profileAssets.reduce(
      (s, a) =>
        a.currency === 'INR' && !isFullySold(a) && !costed.has(a.id)
          ? s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value
          : s,
      0
    );
  }, [profileAssets, portfolioPnl, livePrices, sipValues, liveGoldPricePerGram]);
  const realizedPnl = portfolioPnl.realizedPnl;
  // Cost basis of everything already sold (the "realised investment").
  const realizedCost = portfolioPnl.holdings.reduce((s, h) => s + h.totalCostOfSold, 0);
  const investedShown = portfolioPnl.totalInvested + cashBasis + (includeSold ? realizedCost : 0);
  const netWorthShown = includeSold ? netWorth + realizedPnl : netWorth;
  const netWorthPnl = includeSold ? realizedPnl : portfolioPnl.unrealizedPnl;
  // Percent = the Profit / loss shown ÷ the Total invested shown on the same
  // strip, so the three cards always agree with each other (Total invested
  // includes Cash & Savings at face value). Only shown for the normal (current)
  // view; the realized-only view shows just the amount.
  const netWorthPnlPercent = investedShown > 0 ? (netWorthPnl / investedShown) * 100 : 0;

  const thisMonth = toIsoMonth();
  const { monthIncome, monthExpense } = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of transactions) {
      if (!t.date.startsWith(thisMonth)) continue;
      if (t.type === 'income') income += t.amount;
      else if (t.type === 'expense') expense += t.amount;
    }
    return { monthIncome: income, monthExpense: expense };
  }, [transactions, thisMonth]);

  const investments = useMemo(() => assets.filter((a) => INVESTMENT_CLASSES.has(a.assetClass)), [assets]);
  // Whether "does this person actually have any wealth/cashflow/goals data"
  // can be trusted yet, as opposed to just reflecting an offline cache that
  // hasn't finished loading. If the (unfiltered, all-profiles) collection
  // already has items, we already know the true answer regardless of cache
  // state — no need to wait. Otherwise, wait for the server to actually
  // confirm the collection is empty before treating "0 items" as real
  // rather than "haven't loaded yet". That distinction matters most on a
  // slow mobile connection, where the loading window is long enough to see.
  const wealthDataKnown =
    assetsServerConfirmed && liabilitiesServerConfirmed;
  const cashflowDataKnown = transactionsLoaded;
  const goalsDataKnown = goalsServerConfirmed;
  const hasWealth = assets.length > 0 || liabilities.length > 0;


  // ---- Derived for the new visual sections (all read-only views of the
  // ---- same numbers computed above; nothing here changes a calculation).
  // The three KPI cards at the top are the one place that shows dots while the eye is closed.
  const money = (v: number) =>
    privacyMode && Math.round(v) !== 0 ? '••••••' : maskAmount(v, 'INR', false, { fractionDigits: 0 });
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
      <PageHeader title="Overview" />

      <PriceStaleBanner />

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Full-width on phones so Net worth gets its own row; on desktop it
           sits in the three-column strip like the other two cards. */}
        <div className="col-span-2 lg:col-span-1">
          <StatCard
            dense
            hero
            label="Net worth"
            loading={!ready}
            value={money(hasWealth ? netWorthShown : 0)}
            onToggle={hasWealth ? () => setIncludeSold((v) => !v) : undefined}
            toggled={includeSold}
            sublabel={hasWealth ? undefined : <Link to="/wealth" className="text-primary-ink font-medium hover:underline">Add your first asset</Link>}
          />
        </div>
        <StatCard
          dense
          label="Total invested"
          loading={!ready}
          value={money(hasWealth ? investedShown : 0)}
        />
        <StatCard
          dense
          label="Profit / loss"
          loading={!ready}
          deltaInCorner
          cornerLabel={includeSold ? 'Realized' : undefined}
          tone={!hasWealth || (!includeSold && investedShown <= 0) ? 'default' : netWorthPnl >= 0 ? 'positive' : 'negative'}
          value={hasWealth ? signedMoney(netWorthPnl) : money(0)}
          delta={
            hasWealth && !includeSold && investedShown > 0 && !privacyMode
              ? { value: formatPercentMagnitude(netWorthPnlPercent), positive: netWorthPnl >= 0 }
              : undefined
          }
        />
      </div>

      {/* Performance + allocation */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <NetWorthOverTimeCard privacyMode={privacyMode} ready={netWorthReady} liveNetWorth={householdNetWorth} allProfilesNote={!!activeProfileId} />
        </div>
        <AllocationCard
          data={allocation}
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

      <PriceUpdatedLine />

      {/* PDF Export Modal — renders its own live preview of the report internally */}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function monthLabel(month: string) {
  const [y, m] = month.split('-').map(Number);
  return formatLocaleDate(new Date(y, m - 1, 1), 'en-IN', { month: 'short' });
}

function shortDate(iso: string) {
  return formatDate(iso) || iso;
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
            {privacyMode ? PRIVACY_DOTS : maskAmount(Number(p.value ?? 0), 'INR', false, { fractionDigits: 0 })}
          </span>
        </p>
      ))}
    </div>
  );
}

type Range = '3M' | '6M' | '1Y' | 'ALL';

/** Tooltip for the Net worth over time chart. Unlike the generic
 *  ChartTooltip above, this also looks up the *previous* real history
 *  point (by date, in the currently-displayed series) so it can show the
 *  change and % change since that point — recharts only hands the
 *  tooltip renderer the hovered point itself. */
function NetWorthTooltip({
  active,
  payload,
  label,
  privacyMode,
  data,
}: {
  active?: boolean;
  payload?: readonly unknown[];
  label?: string;
  privacyMode: boolean;
  data: Snapshot[];
}) {
  if (!active || !payload?.length) return null;
  const idx = data.findIndex((d) => d.date === label);
  const point = idx >= 0 ? data[idx] : null;
  if (!point) return null;
  const prev = idx > 0 ? data[idx - 1] : null;
  const change = prev ? point.netWorth - prev.netWorth : null;
  const changePct = prev && prev.netWorth !== 0 ? ((change as number) / prev.netWorth) * 100 : null;

  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2.5 shadow-lg text-xs min-w-[168px]">
      <p className="text-muted font-medium mb-1.5">{formatDate(point.date)}</p>
      <div className="flex items-center justify-between gap-3">
        <span className="text-muted">Net worth</span>
        <span className="font-numeric font-semibold text-ink">
          {privacyMode ? PRIVACY_DOTS : formatPreciseCurrency(point.netWorth)}
        </span>
      </div>
      {change !== null && (
        <div className="flex items-center justify-between gap-3 mt-1.5 pt-1.5 border-t border-line-soft">
          <span className="text-muted">Change</span>
          <span className={`font-numeric font-medium ${change >= 0 ? 'text-positive' : 'text-negative'}`}>
            {privacyMode
              ? PRIVACY_DOTS
              : `${formatSignedCurrency(change, 'INR', 0)}${changePct !== null ? ` (${formatPercentMagnitude(changePct, 1)})` : ''}`}
          </span>
        </div>
      )}
    </div>
  );
}

/** Lives inside the chart purely to report the plot area (the pixel box the
 *  line is drawn in) so taps can be mapped to a data point without relying on
 *  recharts' own click state — which is built from hover and is unreliable on
 *  touch screens. */
function PlotAreaProbe({ areaRef }: { areaRef: { current: { x: number; width: number } | null } }) {
  const area = usePlotArea();
  areaRef.current = area ? { x: area.x, width: area.width } : null;
  return null;
}

/**
 * Removes saved snapshots that are clearly bad readings: a short run (up to 3
 * days) that jumps far away from the line and then comes straight back, e.g.
 * a day saved from a wrong price (₹1.7L between two days at ~₹1.2L). Real
 * changes that stick (a new asset, a sale, a market move that stays) are kept,
 * because the points on either side of them do NOT agree with each other.
 * The newest point is the live value and is never removed.
 */
function dropSpikes(points: Snapshot[]): Snapshot[] {
  const TOL = 0.2; // a point is "off the line" when it differs by more than 20%
  const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1);
  const out = [...points];
  const bad = new Set<number>();
  let prev = 0; // index of the last point kept, the baseline for what follows
  for (let i = 1; i < out.length; i++) {
    let dropped = 0;
    for (let len = 1; len <= 3 && i + len < out.length; len++) {
      const before = out[prev].netWorth;
      if (rel(out[i + len].netWorth, before) > TOL) continue; // the line did not come back: a real move
      let allOff = true;
      for (let k = i; k < i + len; k++) if (rel(out[k].netWorth, before) <= TOL) allOff = false;
      if (allOff) {
        for (let k = i; k < i + len; k++) bad.add(k);
        dropped = len;
        break;
      }
    }
    if (dropped) i += dropped - 1;
    else prev = i;
  }
  return bad.size ? out.filter((_, i) => !bad.has(i)) : out;
}

function NetWorthOverTimeCard({
  privacyMode,
  ready,
  liveNetWorth,
  allProfilesNote = false,
}: {
  privacyMode: boolean;
  /** True once live prices are in. Until then today's point is hidden: the saved one can be stale or wrong. */
  ready: boolean;
  /** Net worth computed from live prices right now — used for today's point so the chart matches the cards. */
  liveNetWorth: number;
  /** A single profile is selected, but this chart always covers all profiles. */
  allProfilesNote?: boolean;
}) {
  // Real, stored history only — the `snapshots` collection the manual
  // "Take Snapshot" action writes to (snapshots are never recorded
  // automatically). Never computed/faked here: this card only ever
  // renders points that actually exist in Firestore for this user.
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const [range, setRange] = useState<Range>('3M');
  const pin = usePinnedTooltip();
  const plotAreaRef = useRef<{ x: number; width: number } | null>(null);

  const allHistory = useMemo(() => {
    const sorted = [...snapshots].sort((a: Snapshot, b: Snapshot) => a.date.localeCompare(b.date));
    // Collapse multiple entries saved on the same day down to the latest
    // one, so re-saving mid-day never draws a misleading near-vertical
    // jump or repeats an x-axis label.
    const byDate = new Map<string, Snapshot>();
    for (const s of sorted) byDate.set(s.date, s);
    // Today's saved point can be stale (or was saved from a bad price), so it
    // never shows while live prices are still loading, and once they are in,
    // it is the live net worth — the same number the cards show.
    const today = toIsoDate();
    const todaySaved = byDate.get(today);
    if (!ready) byDate.delete(today);
    else if (todaySaved && Number.isFinite(liveNetWorth)) byDate.set(today, { ...todaySaved, netWorth: liveNetWorth });
    return dropSpikes([...byDate.values()]);
  }, [snapshots, ready, liveNetWorth]);

  const data = useMemo(() => {
    if (range === 'ALL') return allHistory;
    const months = range === '3M' ? 3 : range === '6M' ? 6 : 12;
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const iso = toIsoDate(cutoff);
    return allHistory.filter((s) => s.date >= iso);
  }, [allHistory, range]);

  // Pixel x (relative to the chart box) → nearest data point, or null when the
  // pointer is outside the plot (e.g. on the y-axis labels).
  const pointAt = (clientX: number, box: DOMRect) => {
    const area = plotAreaRef.current;
    if (!area || data.length === 0 || area.width <= 0) return null;
    const relX = clientX - box.left;
    if (relX < area.x - 8 || relX > area.x + area.width + 8) return null;
    const ratio = Math.min(Math.max((relX - area.x) / area.width, 0), 1);
    const idx = data.length === 1 ? 0 : Math.round(ratio * (data.length - 1));
    const x = data.length === 1 ? area.x + area.width / 2 : area.x + (idx / (data.length - 1)) * area.width;
    return { label: data[idx].date, x };
  };

  // Mouse click → nearest data point (toggles). Touch is handled by the
  // pointer handlers below so a finger can also be dragged along the line.
  const justTouchedRef = useRef(false);
  const handleChartTap = (e: ReactMouseEvent<HTMLDivElement>) => {
    // Taps on the pinned tooltip itself are handled by its own onClick (close).
    if ((e.target as HTMLElement).closest('[data-pinned-tip]')) return;
    // Touch is handled entirely by the pointer handlers. Ignoring touch clicks here
    // stops a stray one (e.g. the last tap on the PIN pad landing on the chart as
    // the lock screen closes) from pinning a value nobody touched.
    if (isTouchDevice() || (e.nativeEvent as PointerEvent).pointerType === 'touch') return;
    // The click that follows a touch was already handled on pointer up.
    if (justTouchedRef.current) {
      justTouchedRef.current = false;
      return;
    }
    const pt = pointAt(e.clientX, e.currentTarget.getBoundingClientRect());
    if (!pt) {
      pin.hidePinned();
      return;
    }
    pin.setPinned((prev) => (prev?.label === pt.label ? null : pt));
  };

  // Touch / pen: the values show only while the finger is on the chart. Press
  // (or start sliding sideways) to see a point's values, slide to move along the
  // line, and lift the finger to hide them again. A quick tap flashes the value
  // for a moment. Vertical swipes scroll the page (touch-action: pan-y); the
  // browser then cancels the gesture and nothing is shown, so scrolling stays smooth.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    pointerId: number;
    scrubbing: boolean;
    shown: boolean;
  } | null>(null);
  const rafRef = useRef(0);
  const holdRef = useRef(0);
  const hideRef = useRef(0);
  const latestXRef = useRef(0);
  const clearTimers = () => {
    cancelAnimationFrame(rafRef.current);
    window.clearTimeout(holdRef.current);
    rafRef.current = 0;
    holdRef.current = 0;
  };
  useEffect(() => () => { clearTimers(); window.clearTimeout(hideRef.current); }, []);

  const showAt = (clientX: number, el: HTMLElement) => {
    const pt = pointAt(clientX, el.getBoundingClientRect());
    if (pt) pin.setPinned((prev) => (prev?.label === pt.label && prev.x === pt.x ? prev : pt));
    return pt;
  };

  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement).closest('[data-pinned-tip]')) return;
    justTouchedRef.current = true;
    window.clearTimeout(hideRef.current);
    const drag = { startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, scrubbing: false, shown: false };
    dragRef.current = drag;
    latestXRef.current = e.clientX;
    const el = e.currentTarget;
    // Show after a short press so a swipe that is really a scroll never flashes it.
    holdRef.current = window.setTimeout(() => {
      holdRef.current = 0;
      if (dragRef.current !== drag) return;
      drag.shown = !!showAt(latestXRef.current, el);
    }, 120);
  };
  const handlePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || e.pointerType === 'mouse') return;
    latestXRef.current = e.clientX;
    if (!drag.scrubbing) {
      const dx = Math.abs(e.clientX - drag.startX);
      const dy = Math.abs(e.clientY - drag.startY);
      if (dx < 6 || dx < dy) return; // not (yet) a sideways drag
      drag.scrubbing = true;
      try { e.currentTarget.setPointerCapture(drag.pointerId); } catch { /* ignore */ }
    }
    // At most one state update per frame, however fast the finger moves.
    if (rafRef.current) return;
    const el = e.currentTarget;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      if (dragRef.current === drag) drag.shown = !!showAt(latestXRef.current, el) || drag.shown;
    });
  };
  const handlePointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || e.pointerType === 'mouse') return;
    const wasPending = holdRef.current !== 0;
    clearTimers();
    window.clearTimeout(hideRef.current);
    if (e.type === 'pointerup' && wasPending && !drag.scrubbing) {
      // Quick tap: flash the value briefly, then hide it.
      if (showAt(e.clientX, e.currentTarget)) hideRef.current = window.setTimeout(pin.hidePinned, 1200);
    } else {
      pin.hidePinned(); // finger lifted (or the browser took over to scroll)
    }
    window.setTimeout(() => { justTouchedRef.current = false; }, 400);
  };

  const first = data[0];
  const last = data[data.length - 1];
  // While a point is pinned / being dragged, the figure above the chart follows it.
  const selected = pin.pinned ? data.find((d) => d.date === pin.pinned!.label) : undefined;
  const shown = selected ?? last;
  const isDown = data.length >= 2 && last.netWorth - first.netWorth < 0;
  const lineColor = isDown ? chart.negative : chart.primary;
  const fillColor = isDown ? chart.negativeSoft : chart.primarySoft;

  // Y-axis domain: padded around the data's own min/max (not forced to
  // start at 0) so real movement is legible, but with a floor on the
  // padded span so a handful of rupees of noise between snapshots never
  // gets stretched into a dramatic-looking cliff.
  const yDomain = useMemo((): [number, number] | undefined => {
    if (data.length === 0) return undefined;
    const values = data.map((d) => d.netWorth);
    const minV = Math.min(...values);
    const maxV = Math.max(...values);
    const mid = (minV + maxV) / 2 || 1;
    const rawSpan = maxV - minV;
    // 0.5% floor (was 6%) so day-to-day market volatility is visible
    // instead of being flattened into a straight line.
    const minSpan = Math.max(Math.abs(mid) * 0.005, 1);
    const span = Math.max(rawSpan, minSpan);
    const pad = span * 0.2;
    return [minV - pad, maxV + pad];
  }, [data]);

  return (
    <Card padding="lg" className="h-full">
      <CardHeader
        title="Net worth over time"
        actions={
          allHistory.length >= 2 ? (
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
          ) : undefined
        }
      />

      {data.length > 0 && (
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-xs text-muted">
            {selected ? 'Selected' : data.length === 1 ? 'Only data point' : 'Latest'} · {formatDate(shown.date)}
            {allProfilesNote ? ' · All profiles' : ''}
          </span>
          <span className="font-numeric text-lg font-semibold text-ink">
            {!ready && !selected ? <LoadingDots /> : privacyMode ? PRIVACY_DOTS : formatPreciseCurrency(shown.netWorth)}
          </span>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          compact
          icon={<TrendingUp size={18} />}
          title="No history yet"
          description="Your net-worth history will appear here as you build your financial timeline."
        />
      ) : (
        <div
          className="h-[220px] -ml-2 relative cursor-pointer select-none"
          style={{ touchAction: 'pan-y', WebkitTapHighlightColor: 'transparent', WebkitUserSelect: 'none' }}
          ref={pin.containerRef}
          onClick={handleChartTap}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
              <PlotAreaProbe areaRef={plotAreaRef} />
              <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) =>
                  formatLocaleDate(new Date(`${d}T00:00:00`), 'en-IN', { month: 'short', day: 'numeric' })
                }
                tick={chart.tick}
                axisLine={false}
                tickLine={false}
                minTickGap={28}
              />
              <YAxis
                tickFormatter={(v: number) => (privacyMode ? PRIVACY_DOTS : formatAxisAmount(v))}
                tick={chart.tick}
                axisLine={false}
                tickLine={false}
                width={56}
                domain={yDomain ?? ['auto', 'auto']}
                allowDecimals={false}
              />
              {/* Recharts' own cursor/active dot follow its hover state, which a
                  finger doesn't drive reliably. So they're off whenever a point is
                  pinned or on touch devices, and the pinned point gets its own
                  line + dot below, so what's highlighted always matches the value
                  shown above the chart. */}
              <Tooltip
                cursor={pin.pinned || isTouchDevice() ? false : chart.tooltip.cursor}
                content={(p) =>
                  pin.pinned || isTouchDevice() ? null : (
                    <NetWorthTooltip
                      active={p.active}
                      payload={p.payload}
                      label={p.label ? String(p.label) : undefined}
                      privacyMode={privacyMode}
                      data={data}
                    />
                  )
                }
              />
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke={lineColor}
                strokeWidth={2}
                fill={fillColor}
                dot={data.length <= 6 ? { r: 4, strokeWidth: 2, stroke: 'var(--color-surface)', fill: lineColor } : false}
                activeDot={
                  pin.pinned || isTouchDevice()
                    ? false
                    : { r: 5, strokeWidth: 2, stroke: 'var(--color-surface)', fill: lineColor }
                }
                isAnimationActive={data.length > 1}
              />
              {selected && (
                <ReferenceLine
                  x={selected.date}
                  stroke={chart.tooltip.cursor.stroke}
                  strokeWidth={1}
                  ifOverflow="visible"
                />
              )}
              {selected && (
                <ReferenceDot
                  x={selected.date}
                  y={selected.netWorth}
                  r={5}
                  fill={lineColor}
                  stroke="var(--color-surface)"
                  strokeWidth={2}
                  ifOverflow="visible"
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
          {pin.pinned && (
            <PinnedChartTooltip containerRef={pin.containerRef} x={pin.pinned.x} onHide={pin.hidePinned}>
              <NetWorthTooltip
                active
                payload={[{}]}
                label={pin.pinned.label}
                privacyMode={privacyMode}
                data={data}
              />
            </PinnedChartTooltip>
          )}
        </div>
      )}
    </Card>
  );
}

function AllocationCard({
  data,
  loading,
  hasWealth,
  privacyMode,
}: {
  data: { key: string; label: string; color: string; value: number }[];
  loading: boolean;
  hasWealth: boolean;
  privacyMode: boolean;
}) {
  const sum = data.reduce((s, d) => s + d.value, 0);
  const [active, setActive] = useState<string | null>(null);
  // Mirror the rings: biggest first, and anything past the 5th folds into one "Other" row (matches maxRings=6).
  const legend = (() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= 6) return sorted;
    const rest = sorted.slice(5).reduce((s, d) => s + d.value, 0);
    return [...sorted.slice(0, 5), { key: '__other', label: 'Other', color: '#94a3b8', value: rest }];
  })();
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
          <ConcentricRings
            items={data}
            size={176}
            maxRings={6}
            activeKey={active}
            onActiveChange={setActive}
            centerExtra={(r) => (privacyMode ? PRIVACY_DOTS : maskAmount(r.value, 'INR', false, { fractionDigits: 0 }))}
            formatPercent={(p) => (privacyMode ? PRIVACY_DOTS : `${p >= 10 ? p.toFixed(0) : p.toFixed(1)}%`)}
          />
          <ul className="mt-4 space-y-2" onMouseLeave={() => setActive(null)}>
            {legend.map((d) => (
              <li
                key={d.key}
                onMouseEnter={() => setActive(d.key)}
                className={`flex items-center gap-2.5 text-sm transition-opacity ${active && active !== d.key ? 'opacity-40' : ''}`}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-ink-2 truncate flex-1">{d.label}</span>
                <span className="font-numeric font-medium text-ink">{(privacyMode ? PRIVACY_DOTS : `${sum > 0 ? ((d.value / sum) * 100).toFixed(1) : '0.0'}%`)}</span>
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
  const m = (v: number) => (privacyMode ? PRIVACY_DOTS : maskAmount(v, 'INR', false, { fractionDigits: 0 }));
  const pin = usePinnedTooltip();
  const pinnedRow = pin.pinned ? trend.find((r) => r.label === pin.pinned!.label) : undefined;
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
                {savingsRate !== null && (
                  <span className="ml-1.5 text-xs font-medium text-muted">{(privacyMode ? PRIVACY_DOTS : `${savingsRate.toFixed(0)}%`)}</span>
                )}
              </p>
            </div>
          </div>
          {trend.length > 1 && (
            <div className="h-[190px] -ml-2 relative" ref={pin.containerRef}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={trend}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barGap={3}
                  onClick={(state) => pin.handleChartClick(state as ChartClickState)}
                >
                  <CartesianGrid stroke={chart.grid} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={chart.tick} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v: number) => (privacyMode ? PRIVACY_DOTS : formatAxisAmount(v))}
                    tick={chart.tick}
                    axisLine={false}
                    tickLine={false}
                    width={52}
                  />
                  <Tooltip
                    cursor={{ fill: 'var(--color-surface-hover)' }}
                    content={(p) =>
                      pin.pinned || isTouchDevice() ? null : (
                        <ChartTooltip
                          {...(p as object)}
                          privacyMode={privacyMode}
                          labels={{ income: 'Income', expense: 'Expenses' }}
                        />
                      )
                    }
                  />
                  <Bar dataKey="income" fill={chart.primary} radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                  <Bar dataKey="expense" fill="#d6b06b" radius={[3, 3, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
              {pin.pinned && pinnedRow && (
                <PinnedChartTooltip containerRef={pin.containerRef} x={pin.pinned.x} onHide={pin.hidePinned}>
                  <ChartTooltip
                    active
                    payload={[
                      { dataKey: 'income', name: 'Income', value: pinnedRow.income, color: chart.primary },
                      { dataKey: 'expense', name: 'Expenses', value: pinnedRow.expense, color: '#d6b06b' },
                    ]}
                    label={pinnedRow.label}
                    privacyMode={privacyMode}
                    labels={{ income: 'Income', expense: 'Expenses' }}
                  />
                </PinnedChartTooltip>
              )}
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
    <Card padding="lg" className="h-full flex flex-col">
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
        <>
          <ul className="space-y-5">
            {goals.slice(0, 4).map((g) => {
              // Same rule as the Goals tab: every goal's progress follows live
              // net worth (never a stale manual entry).
              const current = Math.max(0, netWorth);
              const pct = g.targetAmount > 0 ? Math.min(100, Math.max(0, Math.round((current / g.targetAmount) * 100))) : 0;
              const remaining = Math.max(0, g.targetAmount - current);
              return (
                <li key={g.id}>
                  <div className="flex items-center gap-4">
                    <ProgressRing percent={pct} size={64} stroke={8}>
                      {privacyMode ? PRIVACY_DOTS : `${pct}%`}
                    </ProgressRing>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink truncate">{g.name}</p>
                      <p className="text-xs text-muted mt-0.5 font-numeric font-normal">
                        {privacyMode ? PRIVACY_DOTS : `${maskAmount(current, g.currency, false, { fractionDigits: 0 })} of ${maskAmount(g.targetAmount, g.currency, false, { fractionDigits: 0 })}`}
                      </p>
                      <div className="mt-2 h-1.5 w-full rounded-full bg-line overflow-hidden" aria-hidden="true">
                        <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-muted mt-1.5 font-numeric font-normal">
                        {remaining > 0
                          ? (privacyMode ? PRIVACY_DOTS : `${maskAmount(remaining, g.currency, false, { fractionDigits: 0 })} to go`)
                          : 'Goal reached'}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Sits at the bottom of the card, so a card stretched to match its neighbour is not left blank. */}
          <div className="mt-auto pt-5">
            <Link
              to="/essentials?tab=goals"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-line py-3 text-[13px] font-medium text-primary-ink hover:bg-surface-hover/70"
            >
              <Target size={14} />
              {goals.length >= 4 ? 'See all goals' : 'Add a goal'}
            </Link>
          </div>
        </>
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
                      ? PRIVACY_DOTS
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
                  {(privacyMode ? PRIVACY_DOTS : maskAmount(value, asset.currency, false, { fractionDigits: 0 }))}
                </p>
                {pnlPercent !== undefined && !privacyMode ? (
                  <p className={`font-numeric text-xs font-medium ${pnlPercent >= 0 ? 'text-positive' : 'text-negative'}`}>
                    <TrendArrow up={pnlPercent >= 0} className="mr-1" />
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
