import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardHeader } from './ui';
import InfoTip from './ui/InfoTip';
import { useSectorProfiles } from '../hooks/useSectorProfiles';
import { useSectorTargetsStore } from '../store/sectorTargetsStore';
import { useUiStore } from '../store/uiStore';
import { PRIVACY_DOTS } from '../utils/currency';
import { computePortfolioPnl } from '../utils/investmentPnl';
import { computePortfolioScore, type Band, type Finding } from '../utils/portfolioScore';
import { customSectorDefs, isSectorAsset } from '../utils/sectors';
import type { ValuedAsset } from '../utils/portfolioAnalytics';
import type { SipLiveEntry } from '../store/livePricesStore';

const TONE_TEXT = {
  bad: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  ok: 'text-amber-500 dark:text-amber-300',
  good: 'text-emerald-600 dark:text-emerald-400',
  great: 'text-emerald-600 dark:text-emerald-400',
} as const;
const TONE_BAR = { bad: '#dc2626', warn: '#ea580c', ok: '#f59e0b', good: '#65a30d', great: '#16a34a' } as const;
const BAND_LABEL: Record<Band, string> = { less: 'Less', adequate: 'Adequate', more: 'More' };
const FINDING_TEXT = { good: 'text-emerald-600 dark:text-emerald-400', bad: 'text-red-600 dark:text-red-400', neutral: 'text-muted' } as const;

/**
 * Portfolio score — one 0-100 number for your stocks & ETFs, with the seven
 * checks behind it. Tap a check to see exactly which holdings or sectors moved it.
 */
export default function PortfolioScoreCard({
  items,
  currency,
  livePrices,
  sipValues,
  gold,
}: {
  items: ValuedAsset[];
  currency: string;
  livePrices: Record<string, number>;
  sipValues: Record<string, SipLiveEntry>;
  gold: number | null;
}) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  const targets = useSectorTargetsStore((s) => s.targets);
  const customSectors = useSectorTargetsStore((s) => s.customSectors);
  const customs = useMemo(() => customSectorDefs(customSectors ?? {}), [customSectors]);
  const eligible = useMemo(() => items.filter((i) => isSectorAsset(i.asset)), [items]);
  const { profiles, loading } = useSectorProfiles(useMemo(() => eligible.map((i) => i.asset), [eligible]));
  const [open, setOpen] = useState<string | null>(null);

  const holdings = useMemo(
    () => computePortfolioPnl(eligible.map((i) => i.asset), currency, livePrices, sipValues, gold).active,
    [eligible, currency, livePrices, sipValues, gold]
  );
  const score = useMemo(
    () => computePortfolioScore({ items: eligible, profiles, targets, customs, holdings }),
    [eligible, profiles, targets, customs, holdings]
  );

  if (!score.hasData) return null;
  const hide = (s: string) => (privacyMode ? PRIVACY_DOTS : s);

  return (
    <Card padding="lg">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Portfolio score
            <InfoTip>
              A score out of 100 for your stocks and ETFs at current value: single-stock weight (15), basic / major /
              other sectors against your sector targets (10 each), market-cap mix (10), number of stocks (15) and how
              much money sits in stocks that are well below your cost (30). A check with nothing to measure is left out
              and the rest are scaled to 100.
            </InfoTip>
          </span>
        }
        description="How balanced your stocks and ETFs are. Tap a check for details."
        actions={loading ? <span className="text-xs text-muted">Looking up company sizes…</span> : undefined}
      />

      <div className="flex items-end gap-3 mb-1">
        <span className={`font-numeric text-4xl font-semibold leading-none ${TONE_TEXT[score.rating.tone]}`}>
          {hide(String(score.total))}
        </span>
        <span className="text-sm text-muted mb-0.5">/ 100</span>
        <span className={`ml-auto text-sm font-semibold ${TONE_TEXT[score.rating.tone]}`}>{score.rating.label}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-surface-hover overflow-hidden mb-1" aria-hidden>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${privacyMode ? 0 : score.total}%`, background: TONE_BAR[score.rating.tone] }}
        />
      </div>
      <p className="text-[11px] text-muted mb-3">
        Under 30 very poor · 30–60 poor · 60–80 average · 80–90 good · 90+ excellent
      </p>

      <ul className="divide-y divide-line-soft">
        {score.criteria.map((c, i) => {
          const expanded = open === c.key;
          return (
            <li key={c.key}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : c.key)}
                aria-expanded={expanded}
                className="w-full text-left py-2.5 flex items-center gap-3 cursor-pointer"
              >
                <span className="text-xs text-muted w-4 shrink-0">{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-ink font-medium truncate">{c.title}</span>
                  <span className="block text-[11px] text-muted truncate">{c.summary}</span>
                </span>
                <span className="font-numeric text-sm font-semibold text-ink shrink-0">
                  {hide(`${c.score.toFixed(c.score % 1 ? 1 : 0)}/${c.max}`)}
                </span>
                <ChevronDown size={14} className={`shrink-0 text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
              </button>
              {expanded && (
                <div className="pb-3 pl-7 pr-1 space-y-2">
                  {c.findings.length > 0 ? (
                    <ul className="space-y-1.5">
                      {c.findings.map((f: Finding) => (
                        <li key={f.label} className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-ink">{f.label}</span>
                          <span className={`font-numeric shrink-0 text-right ${FINDING_TEXT[f.tone ?? 'neutral']}`}>
                            {f.band ? `${BAND_LABEL[f.band]} · ` : ''}
                            {hide(f.detail)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-emerald-600 dark:text-emerald-400">Nothing to fix here.</p>
                  )}
                  <p className="text-[11px] text-muted">{c.how}</p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
