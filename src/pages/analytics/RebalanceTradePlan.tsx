import { useMemo } from 'react';
import { Badge, Card, CardHeader } from '../../components/ui';
import Amount from '../../components/Amount';
import { toIsoDate } from '../../utils/date';
import { computeHoldingPnl, isInvestmentHolding } from '../../utils/investmentPnl';
import { resolveAssetValues } from '../../utils/assetValues';
import { unrealisedLots } from '../../utils/capitalGains';
import { buildRebalancePlan } from '../../utils/rebalancePlan';
import { ASSET_CLASS_LABELS } from '../../utils/currency';
import { useAnalyticsSettingsStore } from '../../store/analyticsSettingsStore';
import type { DriftRow } from '../../utils/portfolioAnalytics';
import type { AnalyticsData } from './useAnalyticsData';

/** Sell-side rebalance: which holdings to trim, the estimated tax, and where the money goes. */
export default function RebalanceTradePlan({ data, rows }: { data: AnalyticsData; rows: DriftRow[] }) {
  const { taxAssets, allocItems, currency, livePrices, sipValues, gold } = data;
  const slabRate = useAnalyticsSettingsStore((s) => s.slabRate);
  const today = toIsoDate();

  const lots = useMemo(
    () =>
      taxAssets
        .filter(isInvestmentHolding)
        .map((a) => {
          const r = resolveAssetValues(a, livePrices, sipValues, gold);
          return computeHoldingPnl(a, r.currentPrice, r.isLive);
        })
        .filter((h) => h.totalBoughtQty > 0)
        .flatMap((h) => unrealisedLots(h, today)),
    [taxAssets, livePrices, sipValues, gold, today]
  );
  const plan = useMemo(() => buildRebalancePlan(allocItems, rows, lots, slabRate), [allocItems, rows, lots, slabRate]);

  if (plan.sells.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Rebalance by selling (tax-aware)" description="Trims the cheapest-to-sell positions first: losses, then long-term gains inside the yearly exemption." />
      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Sell</h3>
          <ul className="divide-y divide-line">
            {plan.sells.map((s) => (
              <li key={s.asset.id} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium text-ink">{s.asset.name}</div>
                  <div className="text-xs text-muted">{ASSET_CLASS_LABELS[s.asset.assetClass]}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-medium text-negative"><Amount value={s.amount} currency={currency} /></div>
                  {s.taxKnown ? (
                    <div className="text-xs text-muted">{s.gain < 0 ? 'books a loss' : <>est. tax <Amount value={s.estTax} currency={currency} /></>}</div>
                  ) : (
                    <Badge variant="info">no tax estimate</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Buy with the proceeds</h3>
          <ul className="divide-y divide-line">
            {plan.buys.map((b) => (
              <li key={b.key} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-ink">{b.label}</span>
                <span className="font-medium text-positive"><Amount value={b.amount} currency={currency} /></span>
              </li>
            ))}
            {plan.buys.length === 0 && <li className="py-2.5 text-sm text-muted">No underweight class to buy into.</li>}
          </ul>
          <p className="mt-3 text-sm text-muted">
            Sells <Amount value={plan.totalSell} currency={currency} />, estimated tax <Amount value={plan.totalTax} currency={currency} />, <Amount value={plan.netProceeds} currency={currency} /> left to reinvest.
          </p>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-muted">Estimate only. Uses FIFO lots, current tax rates, your slab rate from the Tax tab and one year's LTCG exemption. Holdings without buy history (deposits, property) show no tax figure. Not tax advice.</p>
    </Card>
  );
}
