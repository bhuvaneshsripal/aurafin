import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight, Lightbulb, X } from 'lucide-react';
import { Card, CardHeader } from './ui';
import { useAnalyticsData } from '../pages/analytics/useAnalyticsData';
import { useGoalsStore } from '../store/goalsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useFinancialProfileStore } from '../store/financialProfileStore';
import { useAnalyticsSettingsStore } from '../store/analyticsSettingsStore';
import { useUiStore } from '../store/uiStore';
import { buildInsights, type InsightLevel } from '../utils/insights';
import { buildUpcomingEvents } from '../utils/upcomingEvents';
import { computeDrift, computeRisk, buildCategoryBreakdown, targetSum } from '../utils/portfolioAnalytics';
import { computeHoldingPnl, isInvestmentHolding } from '../utils/investmentPnl';
import { resolveAssetValues } from '../utils/assetValues';
import { unrealisedLots } from '../utils/capitalGains';
import { toIsoDate } from '../utils/date';
import { DOTS, formatCompact } from '../utils/privateFormat';

const KEY = 'aurafin-insights-snoozed-v1';
const SNOOZE_MS = 7 * 86400000;

function readSnoozed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
  } catch {
    return {};
  }
}

const STYLE: Record<InsightLevel, { icon: typeof Lightbulb; tone: string }> = {
  act: { icon: AlertTriangle, tone: 'text-negative' },
  watch: { icon: Lightbulb, tone: 'text-warning' },
  good: { icon: CheckCircle2, tone: 'text-positive' },
};

/** Dashboard card of ranked, dismissible observations about the portfolio. */
export default function SmartInsights() {
  const data = useAnalyticsData();
  const goals = useGoalsStore((s) => s.goals);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const profile = useFinancialProfileStore((s) => s.profile);
  const { targets, band } = useAnalyticsSettingsStore();
  const privacy = useUiStore((s) => s.privacyMode);
  const [snoozed, setSnoozed] = useState<Record<string, number>>(readSnoozed);
  const [all, setAll] = useState(false);
  const { currency, allocItems, assets, taxAssets, livePrices, sipValues, gold, allocation, liquid } = data;

  const insights = useMemo(() => {
    if (!data.hasData) return [];
    const today = new Date();
    const { total, categories } = buildCategoryBreakdown(allocItems);
    const hasTargets = targetSum(targets) > 0;
    const lots = taxAssets
      .filter(isInvestmentHolding)
      .map((a) => {
        const r = resolveAssetValues(a, livePrices, sipValues, gold);
        return computeHoldingPnl(a, r.currentPrice, r.isLive);
      })
      .filter((h) => h.totalBoughtQty > 0)
      .flatMap((h) => unrealisedLots(h, toIsoDate(today)));
    return buildInsights({
      total,
      slices: allocation.slices,
      risk: computeRisk(allocItems, allocation.slices, liquid),
      liquid,
      monthlyExpense: profile?.monthlyExpense ?? 0,
      liabilities: liabilities.filter((l) => l.currency === currency).reduce((s, l) => s + l.outstanding, 0),
      drift: hasTargets ? computeDrift(categories, total, targets, band) : [],
      hasTargets,
      events: buildUpcomingEvents(assets, goals.filter((g) => g.currency === currency), 30, today),
      goals: goals.filter((g) => g.currency === currency),
      lots,
      today,
      fmt: (v) => (privacy ? DOTS : formatCompact(v, currency)),
    });
  }, [data.hasData, allocItems, allocation.slices, liquid, assets, taxAssets, livePrices, sipValues, gold, goals, liabilities, profile, targets, band, currency, privacy]);

  const now = Date.now();
  const visible = insights.filter((x) => !(snoozed[x.id] && now - snoozed[x.id] < SNOOZE_MS));
  if (visible.length === 0) return null;
  const shown = all ? visible : visible.slice(0, 3);

  const snooze = (id: string) => {
    const next = { ...snoozed, [id]: Date.now() };
    setSnoozed(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* storage unavailable, dismissal lasts for this visit only */
    }
  };

  return (
    <Card>
      <CardHeader title="Smart insights" description="Things worth a look, most urgent first" />
      <ul className="divide-y divide-line">
        {shown.map((x) => {
          const s = STYLE[x.level];
          const Icon = s.icon;
          return (
            <li key={x.id} className="flex items-start gap-3 py-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${s.tone}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-ink">{x.title}</div>
                <p className="mt-0.5 text-sm text-muted">{x.detail}</p>
                {x.to && (
                  <Link to={x.to} className="mt-1 inline-flex items-center gap-0.5 text-sm font-medium text-primary-ink hover:underline">
                    Review <ChevronRight size={14} />
                  </Link>
                )}
              </div>
              {x.level !== 'good' && (
                <button type="button" aria-label="Hide for a week" title="Hide for a week" onClick={() => snooze(x.id)} className="shrink-0 rounded-md p-1 text-faint hover:bg-surface-hover hover:text-ink">
                  <X size={14} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {visible.length > 3 && (
        <button type="button" onClick={() => setAll((v) => !v)} className="mt-2 text-sm font-medium text-primary-ink hover:underline">
          {all ? 'Show fewer' : `Show all ${visible.length}`}
        </button>
      )}
    </Card>
  );
}
