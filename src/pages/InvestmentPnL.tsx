import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  BarChart3,
  Info,
  Search,
  Download,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  Trophy,
  ThumbsDown,
  FileText,
  Table as TableIcon,
  Loader,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useUiStore } from '../store/uiStore';
import {
  computePortfolioPnl,
  buildActivityFeed,
  isInvestable,
  type HoldingPnl,
  type ActivityEntry,
  type PortfolioPnl,
} from '../utils/investmentPnl';
import { ASSET_CLASS_LABELS, ASSET_CLASS_COLORS } from '../utils/taxonomy';
import { formatCurrency, maskAmount, maskPreciseAmount, CURRENCY_SYMBOLS } from '../utils/currency';
import { exportToCsv } from '../utils/exportCsv';
import { exportDomToPdf } from '../utils/exportPdf';
import Modal from '../components/Modal';
import type { Asset } from '../types';

// ---------------------------------------------------------------------------
// Small local helpers
// ---------------------------------------------------------------------------

function fmt(value: number, currency: string, privacy: boolean, precise = false) {
  return precise ? maskPreciseAmount(value, currency, privacy) : maskAmount(value, currency, privacy);
}

function pctLabel(v: number | undefined) {
  if (v === undefined || Number.isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toFixed(2)}%`;
}

function signClass(v: number | undefined) {
  if (v === undefined || Math.abs(v) < 0.005) return 'text-slate-600 dark:text-slate-400';
  return v > 0 ? 'text-brand-600 dark:text-brand-400' : 'text-red-600 dark:text-red-400';
}

function moneyLabel(v: number | undefined, currency: string, privacy: boolean) {
  if (v === undefined) return '—';
  const sign = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${sign}${fmt(Math.abs(v), currency, privacy)}`;
}

function formatShortDate(iso: string | undefined) {
  if (!iso || iso.startsWith('0000') || iso.startsWith('9999')) return '—';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Initials badge shown in place of a company/fund logo — deterministically
 *  colored per asset class, since there's no logo service wired up. */
function AssetBadge({ asset, size = 36 }: { asset: Asset; size?: number }) {
  const color = ASSET_CLASS_COLORS[asset.assetClass] ?? '#64748b';
  const label = (asset.symbol || asset.name || '?').trim().slice(0, 2).toUpperCase();
  return (
    <span
      className="shrink-0 flex items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.36, backgroundColor: color }}
    >
      {label}
    </span>
  );
}

function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex align-middle text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 cursor-help ml-1">
      <Info size={13} />
    </span>
  );
}

const TYPE_FILTERS: { key: string; label: string; classes: string[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'stock', label: 'Stocks', classes: ['stock', 'international_equity'] },
  { key: 'etf', label: 'ETFs', classes: ['etf'] },
  { key: 'mf', label: 'Mutual Funds', classes: ['equity_mutual_fund', 'index_fund', 'hybrid_mutual_fund', 'debt_mutual_fund'] },
  { key: 'gold', label: 'Gold', classes: ['gold', 'silver', 'platinum'] },
  { key: 'crypto', label: 'Crypto', classes: ['crypto_coin'] },
  { key: 'deposits', label: 'FDs & Bonds', classes: ['fixed_deposit', 'recurring_deposit', 'ppf', 'epf', 'vpf', 'nps', 'government_bond', 'corporate_bond', 'sovereign_gold_bond', 'treasury_bill', 'nsc', 'kvp', 'scss', 'sukanya_samriddhi', 'post_office_td', 'debenture'] },
  { key: 'other', label: 'Other' },
].map((f) => ({ ...f, classes: f.classes ?? [] })) as { key: string; label: string; classes: string[] }[];
const TYPE_FILTER_COVERED_CLASSES = new Set(TYPE_FILTERS.flatMap((f) => f.classes));

const POSITION_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'partial', label: 'Partially Sold' },
  { key: 'sold', label: 'Sold' },
] as const;

const PERFORMANCE_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'profit', label: 'Profitable' },
  { key: 'loss', label: 'Loss-making' },
] as const;

const DATE_FILTERS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
  { key: 'all', label: 'All Time' },
] as const;

const CHART_PERIODS = [
  { key: '1m', label: '1M', days: 30 },
  { key: '3m', label: '3M', days: 90 },
  { key: '6m', label: '6M', days: 182 },
  { key: '1y', label: '1Y', days: 365 },
  { key: '3y', label: '3Y', days: 365 * 3 },
  { key: 'all', label: 'ALL', days: null },
] as const;

function activityRangeStart(key: (typeof DATE_FILTERS)[number]['key']): number | null {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  switch (key) {
    case 'today':
      return startOfToday;
    case 'week':
      return startOfToday - 6 * 86400000;
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    case 'year':
      return new Date(now.getFullYear(), 0, 1).getTime();
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Summary card
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  sublabel,
  tone,
  percent,
  tooltip,
  icon,
}: {
  label: string;
  value: string;
  sublabel: string;
  tone: 'neutral' | 'positive' | 'negative';
  percent?: string;
  tooltip?: string;
  icon: React.ReactNode;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-brand-600 dark:text-brand-400'
      : tone === 'negative'
        ? 'text-red-600 dark:text-red-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-slate-500 dark:text-slate-400 flex items-center">
          {label}
          {tooltip && <InfoTip text={tooltip} />}
        </span>
        <span className="text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/30 rounded-xl p-1.5 flex items-center justify-center shrink-0">
          {icon}
        </span>
      </div>
      <div className={`font-numeric text-[26px] leading-tight font-bold truncate ${toneClass}`}>{value}</div>
      <div className="flex items-center gap-2 text-[12.5px]">
        {percent && (
          <span className={`font-semibold flex items-center gap-0.5 ${toneClass}`}>
            {tone === 'positive' ? <ArrowUpRight size={13} /> : tone === 'negative' ? <ArrowDownRight size={13} /> : null}
            {percent}
          </span>
        )}
        <span className="text-slate-500 dark:text-slate-500">{sublabel}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Performance chart — built from real buy/sell transaction dates (there's
// no historical daily market-price feed for arbitrary holdings, so rather
// than fabricate a smooth "value over time" line this plots what's
// actually knowable from the transaction log: cumulative capital deployed,
// and cumulative realized P&L, each step-changing exactly when a real buy
// or sell happened — ending with a live "Today" point that folds in the
// current mark-to-market value / unrealized P&L.
// ---------------------------------------------------------------------------

function PortfolioPerformanceChart({
  holdings,
  currency,
  privacy,
  currentValue,
  currentInvested,
}: {
  holdings: HoldingPnl[];
  currency: string;
  privacy: boolean;
  currentValue: number;
  currentInvested: number;
}) {
  const [period, setPeriod] = useState<(typeof CHART_PERIODS)[number]['key']>('all');
  const [mode, setMode] = useState<'value' | 'pnl'>('value');

  const points = useMemo(() => {
    type Ev = { date: string; investedDelta: number; realizedDelta: number };
    const events: Ev[] = [];
    for (const h of holdings) {
      for (const lot of h.buyLots) {
        if (!lot.date) continue;
        events.push({ date: lot.date, investedDelta: lot.qty * lot.price, realizedDelta: 0 });
      }
      for (const sale of h.sales) {
        if (!sale.date) continue;
        events.push({ date: sale.date, investedDelta: -sale.costOfSold, realizedDelta: sale.realizedPnl });
      }
      // Generic holdings (FDs, RDs, bonds, etc.) don't have buy/sell lots,
      // but most do carry a start/booking date — use that as a one-time
      // "invested" event so they show up in the timeline too instead of
      // only appearing as a jump at the final "Today" point.
      if (h.kind === 'generic' && h.asset.startDate && h.investedValue > 0) {
        events.push({ date: h.asset.startDate, investedDelta: h.investedValue, realizedDelta: 0 });
      }
    }
    events.sort((a, b) => a.date.localeCompare(b.date));

    const periodDef = CHART_PERIODS.find((p) => p.key === period)!;
    const cutoff = periodDef.days ? Date.now() - periodDef.days * 86400000 : null;

    let invested = 0;
    let realized = 0;
    const series: { date: string; invested: number; realized: number; total: number }[] = [];
    for (const ev of events) {
      invested += ev.investedDelta;
      realized += ev.realizedDelta;
      const t = new Date(`${ev.date}T00:00:00`).getTime();
      if (cutoff !== null && t < cutoff) continue;
      series.push({ date: ev.date, invested: Math.max(0, invested), realized, total: Math.max(0, invested) });
    }
    // Always end on a live "Today" point.
    const today = new Date().toISOString().slice(0, 10);
    series.push({
      date: today,
      invested: currentInvested,
      realized,
      total: mode === 'value' ? currentValue : realized + (currentValue - currentInvested),
    });
    return series;
  }, [holdings, period, mode, currentValue, currentInvested]);

  const hasData = points.length > 1;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Portfolio Performance</h3>
          <p className="text-[12.5px] text-slate-500 dark:text-slate-400">
            {mode === 'value' ? 'Capital deployed over time, from your actual buys & sells' : 'Realized + unrealized P&L over time'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-slate-50 dark:bg-slate-800">
            {(['value', 'pnl'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-2.5 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                  mode === m ? 'bg-white dark:bg-slate-900 text-brand-700 dark:text-brand-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {m === 'value' ? 'Value' : 'P&L'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {CHART_PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setPeriod(p.key)}
            className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
              period === p.key
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!hasData ? (
        <div className="h-52 flex items-center justify-center text-[13px] text-slate-400">No transactions in this period yet.</div>
      ) : (
        <div className="h-52 -ml-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pnlFillPositive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2c6e49" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2c6e49" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatShortDate(d).replace(/, \d{4}$/, '')}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                minTickGap={30}
              />
              <YAxis
                tickFormatter={(v: number) => formatCurrency(v, currency)}
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                width={70}
              />
              <RTooltip
                formatter={(v: unknown) => [
                  privacy ? '••••••' : formatCurrency(Number(v ?? 0), currency),
                  mode === 'value' ? 'Value' : 'P&L',
                ]}
                labelFormatter={(d: React.ReactNode) => formatShortDate(String(d))}
                contentStyle={{ borderRadius: 12, border: '1px solid #e5e7eb', fontSize: 12.5 }}
              />
              <Area
                type="monotone"
                dataKey="total"
                stroke="#2c6e49"
                strokeWidth={2}
                fill="url(#pnlFillPositive)"
                isAnimationActive
                animationDuration={500}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Holdings / Sold tables
// ---------------------------------------------------------------------------

function HoldingRow({
  h,
  currency,
  privacy,
  onOpen,
}: {
  h: HoldingPnl;
  currency: string;
  privacy: boolean;
  onOpen: () => void;
}) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2.5">
          <AssetBadge asset={h.asset} size={32} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{h.asset.name}</p>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-500">{ASSET_CLASS_LABELS[h.asset.assetClass]}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">
        {h.kind === 'generic' ? '—' : `${h.remainingQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${h.unitLabel}`}
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">
        {h.kind === 'generic' ? '—' : fmt(h.avgBuyCost, currency, privacy, true)}
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">
        {h.kind === 'lot' && h.currentPrice !== undefined ? fmt(h.currentPrice, currency, privacy, true) : '—'}
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">{fmt(h.investedValue, currency, privacy)}</td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-900 dark:text-white font-semibold">{fmt(h.currentValue, currency, privacy)}</td>
      <td className={`py-3 pr-3 text-right font-numeric text-[13px] font-semibold ${signClass(h.unrealizedPnl)}`}>
        {moneyLabel(h.unrealizedPnl, currency, privacy)}
      </td>
      <td className={`py-3 pr-3 text-right font-numeric text-[13px] font-semibold ${signClass(h.unrealizedPnlPercent)}`}>
        {pctLabel(h.unrealizedPnlPercent)}
      </td>
      <td className="py-3 pl-1">
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            h.status === 'partial'
              ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
              : 'bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300'
          }`}
        >
          {h.status === 'partial' ? 'Partially Sold' : 'Holding'}
        </span>
      </td>
    </tr>
  );
}

function HoldingMobileCard({ h, currency, privacy, onOpen }: { h: HoldingPnl; currency: string; privacy: boolean; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3"
    >
      <AssetBadge asset={h.asset} size={38} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{h.asset.name}</p>
          <p className={`font-numeric text-[13px] font-semibold shrink-0 ${signClass(h.unrealizedPnl)}`}>{pctLabel(h.unrealizedPnlPercent)}</p>
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <p className="text-[12px] text-slate-500 dark:text-slate-500">
            {h.kind === 'generic'
              ? `${ASSET_CLASS_LABELS[h.asset.assetClass]} · ${fmt(h.currentValue, currency, privacy)}`
              : `${h.remainingQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${h.unitLabel} · ${fmt(h.currentValue, currency, privacy)}`}
          </p>
          <p className={`font-numeric text-[12px] font-medium shrink-0 ${signClass(h.unrealizedPnl)}`}>{moneyLabel(h.unrealizedPnl, currency, privacy)}</p>
        </div>
      </div>
      <ChevronRight size={16} className="text-slate-300 shrink-0" />
    </button>
  );
}

function SoldRow({ h, currency, privacy, onOpen }: { h: HoldingPnl; currency: string; privacy: boolean; onOpen: () => void }) {
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-b border-slate-100 dark:border-slate-800 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
    >
      <td className="py-3 pr-3">
        <div className="flex items-center gap-2.5">
          <AssetBadge asset={h.asset} size={32} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">{h.asset.name}</p>
            <p className="text-[11.5px] text-slate-500 dark:text-slate-500">{ASSET_CLASS_LABELS[h.asset.assetClass]}</p>
          </div>
        </div>
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">
        {h.totalSoldQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} {h.unitLabel}
      </td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">{fmt(h.totalCostOfSold, currency, privacy)}</td>
      <td className="py-3 pr-3 text-right font-numeric text-[13px] text-slate-700 dark:text-slate-300">{fmt(h.totalSaleProceeds, currency, privacy)}</td>
      <td className={`py-3 pr-3 text-right font-numeric text-[13px] font-semibold ${signClass(h.realizedPnl)}`}>{moneyLabel(h.realizedPnl, currency, privacy)}</td>
      <td className={`py-3 pr-3 text-right font-numeric text-[13px] font-semibold ${signClass(h.realizedPnlPercent)}`}>{pctLabel(h.realizedPnlPercent)}</td>
      <td className="py-3 pr-3 text-right text-[12.5px] text-slate-500 dark:text-slate-400">{formatShortDate(h.buyLots[0]?.date)}</td>
      <td className="py-3 pl-1 text-[12.5px] text-slate-500 dark:text-slate-400">{formatShortDate(h.sales[h.sales.length - 1]?.date)}</td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Best / Worst performers
// ---------------------------------------------------------------------------

function PerformersCard({ title, icon, items, currency, privacy }: {
  title: string;
  icon: React.ReactNode;
  items: HoldingPnl[];
  currency: string;
  privacy: boolean;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-[12.5px] text-slate-400 py-3">Not enough data yet.</p>
      ) : (
        <div className="space-y-1">
          {items.map((h, i) => (
            <div key={h.asset.id} className="flex items-center gap-2.5 py-1.5">
              <span className="w-5 text-[12px] font-semibold text-slate-400 shrink-0">{i + 1}</span>
              <AssetBadge asset={h.asset} size={26} />
              <span className="flex-1 min-w-0 text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate">{h.asset.name}</span>
              <span className={`font-numeric text-[13px] font-semibold shrink-0 ${signClass(h.lifetimeReturnPercent)}`}>
                {pctLabel(h.lifetimeReturnPercent)}
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="sr-only">Amounts shown in {currency}, {privacy ? 'masked' : 'visible'}.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

function ActivityRow({ entry, currency, privacy }: { entry: ActivityEntry; currency: string; privacy: boolean }) {
  const [open, setOpen] = useState(false);
  const isBuy = entry.type === 'buy';
  return (
    <div className="border-b border-slate-100 dark:border-slate-800 last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 py-3 text-left">
        <span
          className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isBuy ? 'bg-accent-50 text-accent-600 dark:bg-accent-900/30 dark:text-accent-300' : 'bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-300'
          }`}
        >
          {isBuy ? <ArrowDownRight size={16} /> : <ArrowUpRight size={16} />}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
            {isBuy ? 'Buy' : 'Sell'} · {entry.asset.name}
          </p>
          <p className="text-[12px] text-slate-500 dark:text-slate-500">
            {entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} {entry.unitLabel} × {fmt(entry.price, currency, privacy, true)} · {formatShortDate(entry.date)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-numeric text-[13px] font-semibold text-slate-900 dark:text-white">{fmt(entry.netAmount, currency, privacy)}</p>
          {entry.realizedPnl !== undefined && (
            <p className={`font-numeric text-[11.5px] font-medium ${signClass(entry.realizedPnl)}`}>{moneyLabel(entry.realizedPnl, currency, privacy)}</p>
          )}
        </div>
        <ChevronDown size={16} className={`text-slate-300 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="pb-3 pl-11 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[12.5px]">
          <DetailRow label="Type" value={isBuy ? 'Buy' : 'Sell'} />
          <DetailRow label="Symbol" value={entry.asset.symbol || '—'} />
          <DetailRow label="Quantity" value={`${entry.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${entry.unitLabel}`} />
          <DetailRow label="Price" value={fmt(entry.price, currency, privacy, true)} />
          <DetailRow label="Gross amount" value={fmt(entry.grossAmount, currency, privacy)} />
          <DetailRow label="Fees / charges" value={entry.fees > 0 ? fmt(entry.fees, currency, privacy) : '—'} />
          <DetailRow label="Net amount" value={fmt(entry.netAmount, currency, privacy)} />
          <DetailRow label="Date" value={formatShortDate(entry.date)} />
          {entry.realizedPnl !== undefined && (
            <DetailRow label="Realized P&L" value={moneyLabel(entry.realizedPnl, currency, privacy)} valueClass={signClass(entry.realizedPnl)} />
          )}
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-slate-500 dark:text-slate-500">{label}</span>
      <span className={`font-medium text-slate-800 dark:text-slate-200 ${valueClass ?? ''}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Asset detail modal (spec #13)
// ---------------------------------------------------------------------------

function AssetDetailModal({ h, currency, privacy, onClose }: { h: HoldingPnl | null; currency: string; privacy: boolean; onClose: () => void }) {
  return (
    <Modal open={!!h} onClose={onClose} title={h?.asset.name ?? ''} widthClassName="max-w-lg">
      {h && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <AssetBadge asset={h.asset} size={44} />
            <div>
              <p className="text-[15px] font-semibold text-slate-900 dark:text-white">{h.asset.name}</p>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-500">
                {ASSET_CLASS_LABELS[h.asset.assetClass]} {h.asset.symbol ? `· ${h.asset.symbol}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatBox
              label="Current Position"
              value={h.kind === 'generic' ? ASSET_CLASS_LABELS[h.asset.assetClass] : `${h.remainingQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${h.unitLabel}`}
            />
            <StatBox label="Current Value" value={fmt(h.currentValue, currency, privacy)} />
            <StatBox label="Invested" value={fmt(h.investedValue, currency, privacy)} />
          </div>

          <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-4">
            <p className="text-[12.5px] text-slate-500 dark:text-slate-400 mb-1">Unrealized P&L</p>
            <p className={`font-numeric text-[20px] font-bold ${signClass(h.unrealizedPnl)}`}>
              {moneyLabel(h.unrealizedPnl, currency, privacy)}{' '}
              <span className="text-[14px]">({pctLabel(h.unrealizedPnlPercent)})</span>
            </p>
          </div>

          {h.buyLots.length > 0 && (
            <div>
              <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-2">Purchase History</h4>
              <MiniTable
                rows={h.buyLots.map((l) => [formatShortDate(l.date), `${l.qty.toLocaleString(undefined, { maximumFractionDigits: 4 })}`, fmt(l.price, currency, privacy, true), fmt(l.amount, currency, privacy)])}
                headers={['Date', 'Qty', 'Price', 'Amount']}
              />
            </div>
          )}

          {h.sales.length > 0 && (
            <div>
              <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-2">Sell History</h4>
              <MiniTable
                rows={h.sales.map((s) => [
                  formatShortDate(s.date),
                  `${s.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })}`,
                  fmt(s.sellPrice, currency, privacy, true),
                  fmt(s.saleValue, currency, privacy),
                  moneyLabel(s.realizedPnl, currency, privacy),
                ])}
                headers={['Date', 'Qty', 'Price', 'Sale Value', 'Realized P&L']}
                lastColClass={(i) => signClass(h.sales[i]?.realizedPnl)}
              />
            </div>
          )}

          <div>
            <h4 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200 mb-2">Complete P&L</h4>
            <div className="space-y-1.5 text-[13px]">
              <DetailRow label="Total Bought" value={fmt(h.totalBoughtAmount, currency, privacy)} />
              <DetailRow label="Total Sold" value={fmt(h.totalSaleProceeds, currency, privacy)} />
              <DetailRow label="Current Value" value={fmt(h.currentValue, currency, privacy)} />
              <DetailRow label="Realized P&L" value={moneyLabel(h.realizedPnl, currency, privacy)} valueClass={signClass(h.realizedPnl)} />
              <DetailRow label="Unrealized P&L" value={moneyLabel(h.unrealizedPnl, currency, privacy)} valueClass={signClass(h.unrealizedPnl)} />
              <div className="flex justify-between gap-3 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Lifetime P&L</span>
                <span className={`font-numeric font-bold ${signClass(h.totalPnl)}`}>{moneyLabel(h.totalPnl, currency, privacy)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3">
      <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-0.5">{label}</p>
      <p className="font-numeric text-[14px] font-bold text-slate-900 dark:text-white truncate">{value}</p>
    </div>
  );
}

function MiniTable({ headers, rows, lastColClass }: { headers: string[]; rows: string[][]; lastColClass?: (i: number) => string | undefined }) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-slate-400 dark:text-slate-500">
            {headers.map((h, i) => (
              <th key={h} className={`px-1 py-1 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} className="border-t border-slate-100 dark:border-slate-800">
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className={`px-1 py-1.5 font-numeric ${ci === 0 ? 'text-left text-slate-500' : 'text-right text-slate-800 dark:text-slate-200'} ${
                    ci === row.length - 1 && lastColClass ? lastColClass(ri) ?? '' : ''
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Export modal (spec #28)
// ---------------------------------------------------------------------------

function ExportReportModal({
  open,
  onClose,
  reportRef,
  portfolio,
  currency,
  activity,
}: {
  open: boolean;
  onClose: () => void;
  reportRef: React.RefObject<HTMLDivElement | null>;
  portfolio: PortfolioPnl;
  currency: string;
  activity: ActivityEntry[];
}) {
  const [busy, setBusy] = useState<'pdf' | 'csv' | null>(null);
  const [error, setError] = useState('');

  const handlePdf = async () => {
    if (!reportRef.current) return;
    setBusy('pdf');
    setError('');
    try {
      await exportDomToPdf(reportRef.current, `Investment-PnL-Report-${new Date().toISOString().slice(0, 10)}`, 'AuraFin — Investment Profit & Loss Report');
      onClose();
    } catch (err) {
      console.error(err);
      setError('Could not generate the PDF. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleCsv = () => {
    setBusy('csv');
    try {
      exportToCsv(
        `investment-transactions-${new Date().toISOString().slice(0, 10)}`,
        activity.map((e) => ({
          Date: e.date ?? '',
          Type: e.type === 'buy' ? 'BUY' : 'SELL',
          Asset: e.asset.name,
          Symbol: e.asset.symbol ?? '',
          'Asset Class': ASSET_CLASS_LABELS[e.asset.assetClass],
          Quantity: e.quantity,
          Price: e.price,
          'Gross Amount': e.grossAmount,
          Fees: e.fees,
          'Net Amount': e.netAmount,
          'Realized P&L': e.realizedPnl ?? '',
          Currency: currency,
        }))
      );
      onClose();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Export Report">
      <div className="space-y-3">
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          Includes your summary totals, current holdings, sold investments, and full transaction history{portfolio.holdings.length === 0 ? ' (once you have investments to show).' : '.'}
        </p>
        {error && <p className="text-[12.5px] text-red-600">{error}</p>}
        <button
          onClick={handlePdf}
          disabled={busy !== null}
          className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-60"
        >
          <span className="w-9 h-9 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center shrink-0">
            {busy === 'pdf' ? <Loader size={16} className="animate-spin" /> : <FileText size={16} />}
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-white">Download as PDF</span>
            <span className="block text-[12px] text-slate-500 dark:text-slate-500">Formatted summary report</span>
          </span>
        </button>
        <button
          onClick={handleCsv}
          disabled={busy !== null}
          className="w-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left disabled:opacity-60"
        >
          <span className="w-9 h-9 rounded-lg bg-accent-50 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0">
            {busy === 'csv' ? <Loader size={16} className="animate-spin" /> : <TableIcon size={16} />}
          </span>
          <span>
            <span className="block text-[13.5px] font-semibold text-slate-900 dark:text-white">Download as CSV</span>
            <span className="block text-[12px] text-slate-500 dark:text-slate-500">Complete transaction-level data</span>
          </span>
        </button>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Empty state (spec #24)
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center flex flex-col items-center gap-3 shadow-soft">
      <span className="w-14 h-14 rounded-2xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center">
        <Sparkles size={26} />
      </span>
      <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">Start tracking your investment journey</h3>
      <p className="text-[13.5px] text-slate-500 dark:text-slate-400 max-w-sm">
        Add your first investment to see your portfolio performance, realized gains, and complete profit &amp; loss history.
      </p>
      <Link
        to="/wealth?add=1"
        className="mt-2 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white text-[13.5px] font-semibold transition-colors"
      >
        Add Investment
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function InvestmentPnL() {
  const allAssets = useAssetsStore((s) => s.assets);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const goldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [positionFilter, setPositionFilter] = useState<(typeof POSITION_FILTERS)[number]['key']>('all');
  const [performanceFilter, setPerformanceFilter] = useState<(typeof PERFORMANCE_FILTERS)[number]['key']>('all');
  const [dateFilter, setDateFilter] = useState<(typeof DATE_FILTERS)[number]['key']>('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedHolding, setSelectedHolding] = useState<HoldingPnl | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [soldExpanded, setSoldExpanded] = useState(false);

  // Every currency present among investment-holding assets — the book has
  // to be scoped to one currency at a time (see investmentPnl.ts docs), so
  // when more than one is in play the person can switch which book they're
  // viewing instead of totals silently mixing ₹ and $.
  const currencies = useMemo(() => {
    const counts = new Map<string, number>();
    assets.filter(isInvestable).forEach((a) => counts.set(a.currency, (counts.get(a.currency) ?? 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [assets]);
  const [currency, setCurrency] = useState<string | null>(null);
  const activeCurrency = currency ?? currencies[0] ?? 'INR';

  const portfolio = useMemo(
    () => computePortfolioPnl(assets, activeCurrency, livePrices, sipValues, goldPricePerGram),
    [assets, activeCurrency, livePrices, sipValues, goldPricePerGram]
  );

  const hasAnyInvestments = portfolio.holdings.length > 0;

  const matchesType = (h: HoldingPnl) => {
    if (typeFilter === 'all') return true;
    if (typeFilter === 'other') return !TYPE_FILTER_COVERED_CLASSES.has(h.asset.assetClass);
    const def = TYPE_FILTERS.find((t) => t.key === typeFilter);
    return def ? def.classes.includes(h.asset.assetClass) : true;
  };
  const matchesSearch = (h: HoldingPnl) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return h.asset.name.toLowerCase().includes(q) || (h.asset.symbol ?? '').toLowerCase().includes(q);
  };
  const matchesPosition = (h: HoldingPnl) => {
    if (positionFilter === 'all') return true;
    return h.status === positionFilter;
  };
  const matchesPerformance = (h: HoldingPnl) => {
    if (performanceFilter === 'all') return true;
    const pnl = h.status === 'sold' ? h.realizedPnl : h.totalPnl ?? 0;
    return performanceFilter === 'profit' ? pnl > 0 : pnl < 0;
  };

  const filteredActive = useMemo(
    () => portfolio.active.filter((h) => matchesType(h) && matchesSearch(h) && matchesPerformance(h) && matchesPosition(h)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio.active, typeFilter, search, performanceFilter, positionFilter]
  );
  const filteredSold = useMemo(
    () => portfolio.sold.filter((h) => matchesType(h) && matchesSearch(h) && matchesPerformance(h) && matchesPosition(h)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [portfolio.sold, typeFilter, search, performanceFilter, positionFilter]
  );

  const activityAll = useMemo(() => buildActivityFeed(portfolio.holdings), [portfolio.holdings]);
  const activityCutoff = activityRangeStart(dateFilter);
  const activity = useMemo(() => {
    let list = activityAll;
    if (activityCutoff !== null) {
      list = list.filter((e) => e.date && new Date(`${e.date}T00:00:00`).getTime() >= activityCutoff);
    }
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((e) => e.asset.name.toLowerCase().includes(q) || (e.asset.symbol ?? '').toLowerCase().includes(q));
    return list;
  }, [activityAll, activityCutoff, search]);

  const bestPerformers = useMemo(
    () =>
      [...portfolio.holdings]
        .filter((h) => h.lifetimeReturnPercent !== undefined)
        .sort((a, b) => (b.lifetimeReturnPercent ?? 0) - (a.lifetimeReturnPercent ?? 0))
        .slice(0, 5),
    [portfolio.holdings]
  );
  const worstPerformers = useMemo(
    () =>
      [...portfolio.holdings]
        .filter((h) => h.lifetimeReturnPercent !== undefined)
        .sort((a, b) => (a.lifetimeReturnPercent ?? 0) - (b.lifetimeReturnPercent ?? 0))
        .slice(0, 5),
    [portfolio.holdings]
  );

  const reportRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 dark:text-white tracking-tight">Profit &amp; Loss</h1>
          <p className="text-[13.5px] text-slate-500 dark:text-slate-400">Track your complete investment performance, from the very first transaction.</p>
        </div>
        <div className="flex items-center gap-2">
          {currencies.length > 1 && (
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 bg-white dark:bg-slate-900">
              {currencies.map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={`px-2.5 py-1.5 rounded-md text-[12.5px] font-semibold transition-colors ${
                    activeCurrency === c ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {CURRENCY_SYMBOLS[c] ?? c}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setExportOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Download size={15} />
            <span className="hidden sm:inline">Export Report</span>
          </button>
        </div>
      </div>

      {!hasAnyInvestments ? (
        <EmptyState />
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search investments..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[13px] focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[13px] font-semibold transition-colors ${
                filtersOpen ? 'border-brand-500 text-brand-700 dark:text-brand-300 bg-brand-50 dark:bg-brand-900/30' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              Filters
              <ChevronDown size={14} className={`transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {filtersOpen && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
              <FilterGroup label="Type" options={TYPE_FILTERS} value={typeFilter} onChange={setTypeFilter} />
              <FilterGroup label="Position" options={POSITION_FILTERS} value={positionFilter} onChange={(v) => setPositionFilter(v as any)} />
              <FilterGroup label="Performance" options={PERFORMANCE_FILTERS} value={performanceFilter} onChange={(v) => setPerformanceFilter(v as any)} />
              <FilterGroup label="Activity date range" options={DATE_FILTERS} value={dateFilter} onChange={(v) => setDateFilter(v as any)} />
            </div>
          )}

          <div ref={reportRef} id="investment-pnl-report" className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <SummaryCard
                label="Total Invested"
                value={fmt(portfolio.totalInvested, activeCurrency, privacyMode)}
                sublabel="Total money invested"
                tone="neutral"
                tooltip="Capital used to purchase your current and historical investments."
                icon={<Wallet size={16} />}
              />
              <SummaryCard
                label="Current Value"
                value={fmt(portfolio.currentValue, activeCurrency, privacyMode)}
                sublabel="Current portfolio value"
                tone="neutral"
                icon={<BarChart3 size={16} />}
              />
              <SummaryCard
                label="Unrealized P&L"
                value={moneyLabel(portfolio.unrealizedPnl, activeCurrency, privacyMode)}
                sublabel="On current holdings"
                percent={pctLabel(portfolio.unrealizedPnlPercent)}
                tone={portfolio.unrealizedPnl >= 0 ? 'positive' : 'negative'}
                tooltip="Profit or loss on investments you currently hold, based on their current value."
                icon={portfolio.unrealizedPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              />
              <SummaryCard
                label="Realized P&L"
                value={moneyLabel(portfolio.realizedPnl, activeCurrency, privacyMode)}
                sublabel="From sold investments"
                tone={portfolio.realizedPnl >= 0 ? 'positive' : 'negative'}
                tooltip="Profit or loss from investments you have already sold."
                icon={<PiggyBank size={16} />}
              />
              <SummaryCard
                label="Total P&L"
                value={moneyLabel(portfolio.totalPnl, activeCurrency, privacyMode)}
                sublabel="Lifetime investment profit"
                tone={portfolio.totalPnl >= 0 ? 'positive' : 'negative'}
                tooltip="Combined realized and unrealized profit or loss."
                icon={portfolio.totalPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              />
              <SummaryCard
                label="Total Return"
                value={pctLabel(portfolio.totalReturnPercent)}
                sublabel="Lifetime return"
                tone={(portfolio.totalReturnPercent ?? 0) >= 0 ? 'positive' : 'negative'}
                tooltip="Total P&L measured against every rupee you've ever put into an investment, not just what's currently deployed."
                icon={<Trophy size={16} />}
              />
            </div>

            {/* Performance chart */}
            <PortfolioPerformanceChart
              holdings={portfolio.holdings}
              currency={activeCurrency}
              privacy={privacyMode}
              currentValue={portfolio.currentValue}
              currentInvested={portfolio.totalInvested}
            />

            {/* P&L Breakdown */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
              <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-4">P&amp;L Breakdown</h3>
              <div className="grid grid-cols-3 gap-4 mb-5">
                <BreakdownStat label="Unrealized Profit" value={moneyLabel(portfolio.unrealizedPnl, activeCurrency, privacyMode)} tone={signClass(portfolio.unrealizedPnl)} />
                <BreakdownStat label="Realized Profit" value={moneyLabel(portfolio.realizedPnl, activeCurrency, privacyMode)} tone={signClass(portfolio.realizedPnl)} />
                <BreakdownStat label="Total Profit" value={moneyLabel(portfolio.totalPnl, activeCurrency, privacyMode)} tone={signClass(portfolio.totalPnl)} />
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                <BreakdownStat label="Profitable (sold)" value={String(portfolio.profitableCount)} tone="text-brand-600 dark:text-brand-400" />
                <BreakdownStat label="Loss-making (sold)" value={String(portfolio.lossMakingCount)} tone="text-red-600 dark:text-red-400" />
                <BreakdownStat label="Completed Positions" value={String(portfolio.completedCount)} tone="text-slate-900 dark:text-white" />
                <BreakdownStat
                  label="Win Rate"
                  value={portfolio.winRatePercent !== undefined ? `${portfolio.winRatePercent.toFixed(1)}%` : '—'}
                  tone="text-slate-900 dark:text-white"
                  tooltip="Calculated only from fully-sold (closed) positions — active holdings aren't counted as a win or loss yet."
                />
              </div>
            </div>

            {/* Current Holdings */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Current Holdings</h3>
                <span className="text-[12px] text-slate-400">{filteredActive.length} holding{filteredActive.length === 1 ? '' : 's'}</span>
              </div>
              {filteredActive.length === 0 ? (
                <p className="text-[13px] text-slate-400 py-6 text-center">No active holdings match these filters.</p>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2 pr-3 font-semibold">Asset</th>
                          <th className="py-2 pr-3 text-right font-semibold">Qty</th>
                          <th className="py-2 pr-3 text-right font-semibold">Avg Buy</th>
                          <th className="py-2 pr-3 text-right font-semibold">Current Price</th>
                          <th className="py-2 pr-3 text-right font-semibold">Invested</th>
                          <th className="py-2 pr-3 text-right font-semibold">Current Value</th>
                          <th className="py-2 pr-3 text-right font-semibold">P&amp;L</th>
                          <th className="py-2 pr-3 text-right font-semibold">Return</th>
                          <th className="py-2 pl-1 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredActive.map((h) => (
                          <HoldingRow key={h.asset.id} h={h} currency={activeCurrency} privacy={privacyMode} onOpen={() => setSelectedHolding(h)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="md:hidden space-y-2.5">
                    {filteredActive.map((h) => (
                      <HoldingMobileCard key={h.asset.id} h={h} currency={activeCurrency} privacy={privacyMode} onOpen={() => setSelectedHolding(h)} />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Best / Worst performers */}
            <div className="grid md:grid-cols-2 gap-4">
              <PerformersCard title="Best Performers" icon={<Trophy size={16} className="text-brand-600" />} items={bestPerformers} currency={activeCurrency} privacy={privacyMode} />
              <PerformersCard title="Worst Performers" icon={<ThumbsDown size={16} className="text-red-500" />} items={worstPerformers} currency={activeCurrency} privacy={privacyMode} />
            </div>

            {/* Sold Investments */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
              <button onClick={() => setSoldExpanded((o) => !o)} className="w-full flex items-center justify-between mb-1">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Sold Investments</h3>
                <span className="flex items-center gap-2 text-[12px] text-slate-400">
                  {filteredSold.length} sold
                  <ChevronDown size={15} className={`transition-transform ${soldExpanded ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {(soldExpanded || filteredSold.length <= 5) &&
                (filteredSold.length === 0 ? (
                  <p className="text-[13px] text-slate-400 py-6 text-center">Nothing sold yet — realized gains and losses will show up here once you sell an investment down to zero.</p>
                ) : (
                  <div className="overflow-x-auto mt-2">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800">
                          <th className="py-2 pr-3 font-semibold">Asset</th>
                          <th className="py-2 pr-3 text-right font-semibold">Qty Sold</th>
                          <th className="py-2 pr-3 text-right font-semibold">Total Cost</th>
                          <th className="py-2 pr-3 text-right font-semibold">Sale Value</th>
                          <th className="py-2 pr-3 text-right font-semibold">Realized P&amp;L</th>
                          <th className="py-2 pr-3 text-right font-semibold">Return</th>
                          <th className="py-2 pr-3 font-semibold">Buy Date</th>
                          <th className="py-2 pl-1 font-semibold">Sell Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredSold.map((h) => (
                          <SoldRow key={h.asset.id} h={h} currency={activeCurrency} privacy={privacyMode} onOpen={() => setSelectedHolding(h)} />
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              {!soldExpanded && filteredSold.length > 5 && (
                <button onClick={() => setSoldExpanded(true)} className="text-[12.5px] font-semibold text-brand-600 dark:text-brand-400 mt-2">
                  Show all {filteredSold.length} sold investments →
                </button>
              )}
            </div>

            {/* Investment Activity */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-soft">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-[15px] font-semibold text-slate-900 dark:text-white">Investment Activity</h3>
                <span className="text-[12px] text-slate-400">{activity.length} transaction{activity.length === 1 ? '' : 's'}</span>
              </div>
              {activity.length === 0 ? (
                <p className="text-[13px] text-slate-400 py-6 text-center">No transactions in this range.</p>
              ) : (
                <div className="mt-1">
                  {activity.slice(0, 100).map((e) => (
                    <ActivityRow key={e.key} entry={e} currency={activeCurrency} privacy={privacyMode} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      <AssetDetailModal h={selectedHolding} currency={activeCurrency} privacy={privacyMode} onClose={() => setSelectedHolding(null)} />
      <ExportReportModal open={exportOpen} onClose={() => setExportOpen(false)} reportRef={reportRef} portfolio={portfolio} currency={activeCurrency} activity={activityAll} />
    </div>
  );
}

function BreakdownStat({ label, value, tone, tooltip }: { label: string; value: string; tone: string; tooltip?: string }) {
  return (
    <div>
      <p className="text-[12px] text-slate-500 dark:text-slate-400 flex items-center">
        {label}
        {tooltip && <InfoTip text={tooltip} />}
      </p>
      <p className={`font-numeric text-[18px] font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function FilterGroup<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { key: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className={`px-2.5 py-1 rounded-full text-[12px] font-semibold border transition-colors ${
              value === o.key
                ? 'bg-brand-600 border-brand-600 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
