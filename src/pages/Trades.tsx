import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight } from 'lucide-react';
import { Card, EmptyState, PageHeader, SegmentedControl, StatCard } from '../components/ui';
import { cn } from '../components/ui/cn';
import { useAssetsStore } from '../store/assetsStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useUiStore } from '../store/uiStore';
import HeaderPills from '../components/HeaderPills';
import { PRIVACY_DOTS, maskPreciseAmount, formatSignedCurrency } from '../utils/currency';
import { toIsoDate } from '../utils/date';
import { buildActivityFeed, computeHoldingPnl, type ActivityEntry } from '../utils/investmentPnl';

type Range = 'today' | 'yesterday' | '7d' | '30d';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
];

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return toIsoDate(d);
}

/** [from, to] inclusive, as YYYY-MM-DD strings (which sort like dates). */
function rangeBounds(r: Range): [string, string] {
  if (r === 'today') return [daysAgo(0), daysAgo(0)];
  if (r === 'yesterday') return [daysAgo(1), daysAgo(1)];
  if (r === '7d') return [daysAgo(6), daysAgo(0)];
  return [daysAgo(29), daysAgo(0)];
}

function dayLabel(iso: string) {
  if (iso === daysAgo(0)) return 'Today';
  if (iso === daysAgo(1)) return 'Yesterday';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Every buy and sell in the chosen window, newest day first. Built from the same lot history as Wealth → Performance. */
export default function Trades({ tabNav }: { tabNav?: ReactNode } = {}) {
  const [range, setRange] = useState<Range>('today');
  const privacyMode = useUiStore((s) => s.privacyMode);
  const allAssets = useAssetsStore((s) => s.assets);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  const feed = useMemo(() => {
    const scoped = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
    const holdings = scoped
      .filter((a) => a.assetClass !== 'cash' && ((a.shareLots?.length ?? 0) > 0 || (a.purchaseLots?.length ?? 0) > 0 || (a.saleLots?.length ?? 0) > 0))
      .map((a) => computeHoldingPnl(a, undefined, false));
    return buildActivityFeed(holdings);
  }, [allAssets, activeProfileId]);

  const [from, to] = rangeBounds(range);
  const trades = useMemo(() => feed.filter((e) => e.date && e.date >= from && e.date <= to), [feed, from, to]);

  const groups = useMemo(() => {
    const m = new Map<string, ActivityEntry[]>();
    for (const t of trades) m.set(t.date!, [...(m.get(t.date!) ?? []), t]);
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [trades]);

  const buys = trades.filter((t) => t.type === 'buy');
  const sells = trades.filter((t) => t.type === 'sell');
  const bought = buys.reduce((s, t) => s + t.netAmount, 0);
  const sold = sells.reduce((s, t) => s + t.netAmount, 0);
  const realized = sells.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);
  const money = (n: number, cur = 'INR') => maskPreciseAmount(n, cur, privacyMode);
  const signed = (n: number, cur = 'INR') => (privacyMode ? PRIVACY_DOTS : formatSignedCurrency(n, cur, 2));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trades"
        description={
          <>
            <HeaderPills
              pills={[
                { value: buys.length, label: buys.length === 1 ? 'buy' : 'buys', tone: 'brand' },
                { value: sells.length, label: sells.length === 1 ? 'sell' : 'sells', tone: 'red' },
                ...(sells.length > 0
                  ? [{ value: signed(realized), label: 'realised', tone: (realized >= 0 ? 'brand' : 'red') as 'brand' | 'red', valueTone: (realized >= 0 ? 'positive' : 'negative') as 'positive' | 'negative' }]
                  : []),
              ]}
            />
          </>
        }
        actions={<SegmentedControl<Range> size="sm" value={range} onChange={setRange} items={RANGES} />}
      />
      {tabNav}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard dense label="Trades" value={`${trades.length}`} sublabel={`${buys.length} buy${buys.length === 1 ? '' : 's'} · ${sells.length} sell${sells.length === 1 ? '' : 's'}`} />
        <StatCard dense label="Bought" value={money(bought)} />
        <StatCard dense label="Sold" value={money(sold)} />
        <StatCard
          dense
          label="Realized P&L"
          tone={sells.length === 0 ? 'default' : realized >= 0 ? 'positive' : 'negative'}
          value={sells.length === 0 ? '—' : signed(realized)}
        />
      </div>

      {groups.length === 0 ? (
        <Card padding="lg">
          <EmptyState
            icon={<ArrowLeftRight size={22} />}
            title={range === 'today' ? 'No buys or sells recorded today' : 'No trades in this period'}
            description="Trades appear here when you add a buy or sell on a holding in Wealth, dated within the period."
            action={
              <Link to="/wealth" className="text-sm font-medium text-primary-ink hover:underline">
                Go to Wealth
              </Link>
            }
          />
        </Card>
      ) : (
        groups.map(([date, rows]) => (
          <Card key={date} padding="none" className="overflow-hidden">
            <div className="px-5 py-3 border-b border-line-soft bg-surface-muted/50 flex items-center justify-between">
              <p className="text-[13px] font-semibold text-ink">{dayLabel(date)}</p>
              <p className="text-xs text-muted">
                {rows.length} trade{rows.length === 1 ? '' : 's'}
              </p>
            </div>
            <ul className="divide-y divide-line-soft px-5">
              {rows.map((t) => {
                const isBuy = t.type === 'buy';
                return (
                  <li key={t.key} className="flex items-center gap-3 py-3">
                    <span
                      className={cn('shrink-0 h-9 w-9 rounded-full flex items-center justify-center', isBuy ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative')}
                      aria-hidden
                    >
                      {isBuy ? <ArrowDownRight size={17} /> : <ArrowUpRight size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-ink">
                        <span className={cn('mr-1.5 text-[11px] font-bold uppercase tracking-wide', isBuy ? 'text-positive' : 'text-negative')}>{isBuy ? 'Buy' : 'Sell'}</span>
                        {t.asset.name}
                      </p>
                      <p className="font-numeric text-xs text-muted">
                        {privacyMode ? PRIVACY_DOTS : t.quantity.toLocaleString('en-IN', { maximumFractionDigits: 4 })} {t.unitLabel} × {money(t.price, t.asset.currency)}
                        {t.fees > 0 && !privacyMode ? ` · fees ${money(t.fees, t.asset.currency)}` : ''}
                      </p>
                    </div>
                    <div className="shrink-0 text-right font-numeric">
                      <p className="text-sm font-semibold text-ink">{money(t.netAmount, t.asset.currency)}</p>
                      {t.realizedPnl !== undefined && (
                        <p className={cn('text-xs font-medium', t.realizedPnl >= 0 ? 'text-positive' : 'text-negative')}>{signed(t.realizedPnl, t.asset.currency)}</p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
