import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from 'lucide-react';
import { Badge, Card, CardHeader, StatCard } from '../../components/ui';
import Amount from '../../components/Amount';
import { computeRisk, type RiskSeverity } from '../../utils/portfolioAnalytics';
import { ASSET_CLASS_LABELS } from '../../utils/currency';
import type { AnalyticsData } from './useAnalyticsData';

const SEV: Record<RiskSeverity, { icon: typeof Info; tone: string; badge: 'danger' | 'warning' | 'info' | 'success'; label: string }> = {
  high: { icon: ShieldAlert, tone: 'text-negative', badge: 'danger', label: 'High' },
  medium: { icon: AlertTriangle, tone: 'text-warning', badge: 'warning', label: 'Medium' },
  low: { icon: Info, tone: 'text-muted', badge: 'info', label: 'Low' },
  ok: { icon: CheckCircle2, tone: 'text-positive', badge: 'success', label: 'OK' },
};

export default function RiskTab({ data }: { data: AnalyticsData }) {
  const { items, allocation, liquid, currency } = data;
  const risk = useMemo(() => computeRisk(items, allocation.slices, liquid), [items, allocation.slices, liquid]);
  const gradeTone = risk.grade === 'Excellent' || risk.grade === 'Good' ? 'positive' : risk.grade === 'Poor' ? 'negative' : 'default';

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Diversification score" value={`${risk.score}/100`} tone={gradeTone} sublabel={risk.grade} />
        <StatCard label="Effective holdings" value={risk.effectiveHoldings.toFixed(1)} sublabel={`of ${risk.holdings.length} actual`} />
        <StatCard label="Top 5 holdings" value={`${risk.top5Pct.toFixed(0)}%`} sublabel="share of portfolio" />
        <StatCard label="Liquid assets" value={<Amount value={liquid} currency={currency} />} sublabel="cash, FDs, liquid funds" />
      </div>

      <Card>
        <CardHeader title="Risk flags" description="Plain-English checks on how concentrated your portfolio is" />
        <ul className="divide-y divide-line">
          {risk.flags.map((f, i) => {
            const s = SEV[f.severity];
            const Icon = s.icon;
            return (
              <li key={i} className="flex gap-3 py-3">
                <Icon size={18} className={`mt-0.5 shrink-0 ${s.tone}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-ink">{f.title}</span>
                    <Badge variant={s.badge}>{s.label}</Badge>
                  </div>
                  <p className="mt-0.5 text-sm text-muted">{f.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <CardHeader title="Biggest positions" description="Share of total portfolio value" />
        <ul className="space-y-3">
          {risk.holdings.slice(0, 10).map((h) => (
            <li key={h.asset.id}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-ink">
                  {h.asset.name} <span className="text-xs text-muted">· {ASSET_CLASS_LABELS[h.asset.assetClass]}</span>
                </span>
                <span className="shrink-0 text-muted">
                  <Amount value={h.value} currency={currency} /> · {h.pct.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, h.pct)}%`, background: h.pct > 25 ? 'var(--color-negative)' : h.pct > 15 ? 'var(--color-warning)' : 'var(--color-brand-600)' }} />
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
