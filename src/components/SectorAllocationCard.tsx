import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardHeader } from './ui';
import InfoTip from './ui/InfoTip';
import { useUiStore } from '../store/uiStore';
import { maskAmount } from '../utils/currency';
import { buildSectorAllocation, isSectorAsset } from '../utils/sectors';
import { useSectorProfiles } from '../hooks/useSectorProfiles';
import type { ValuedAsset } from '../utils/portfolioAnalytics';

const pctLabel = (p: number) => (p <= 0 ? '0%' : p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`);

/**
 * Sector allocation — what share of your stocks, ETFs, funds and metals (at
 * current value) sits in each sector. Every important sector is always listed,
 * with 0% when you hold nothing in it. Tap a sector to see which of your
 * holdings were placed there.
 */
export default function SectorAllocationCard({ items, currency }: { items: ValuedAsset[]; currency: string }) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  const eligible = useMemo(() => items.filter((i) => isSectorAsset(i.asset)), [items]);
  const { profiles, loading } = useSectorProfiles(useMemo(() => eligible.map((i) => i.asset), [eligible]));
  const { total, rows } = useMemo(() => buildSectorAllocation(eligible, profiles), [eligible, profiles]);
  const [open, setOpen] = useState<string | null>(null);

  const maxPct = Math.max(1, ...rows.map((r) => r.pct));

  return (
    <Card padding="lg">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Sector allocation
            <InfoTip>
              Counts your stocks, ETFs, mutual funds, gold and silver at their current value. Single stocks are placed by
              company sector; gold ETFs, SGBs and physical gold go under Gold; index funds and broad ETFs are shown as
              Diversified. Debt, cash and property aren't included.
            </InfoTip>
          </span>
        }
        description={
          total > 0
            ? `Share of ${maskAmount(total, currency, privacyMode, { fractionDigits: 0 })} in stocks, ETFs, funds & metals`
            : 'Add stocks, ETFs or funds to see your sector mix.'
        }
        actions={loading ? <span className="text-xs text-muted">Looking up sectors…</span> : undefined}
      />

      <ul className="divide-y divide-line-soft">
        {rows.map((r) => {
          const held = r.holdings.length > 0;
          const expanded = open === r.key && held;
          return (
            <li key={r.key}>
              <button
                type="button"
                disabled={!held}
                onClick={() => setOpen(expanded ? null : r.key)}
                aria-expanded={expanded}
                className={`w-full text-left py-2.5 flex items-center gap-3 ${held ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color, opacity: held ? 1 : 0.35 }} />
                <span className={`flex-1 min-w-0 text-sm truncate ${held ? 'text-ink font-medium' : 'text-muted'}`}>{r.label}</span>
                <span className="hidden sm:block w-40 h-1.5 rounded-full bg-surface-hover overflow-hidden">
                  <span
                    className="block h-full rounded-full"
                    style={{ width: `${(r.pct / maxPct) * 100}%`, background: r.color }}
                  />
                </span>
                <span className={`font-numeric text-sm w-14 text-right ${held ? 'text-ink font-semibold' : 'text-muted'}`}>
                  {pctLabel(r.pct)}
                </span>
                <ChevronDown
                  size={14}
                  className={`shrink-0 transition-transform ${held ? 'text-muted' : 'opacity-0'} ${expanded ? 'rotate-180' : ''}`}
                />
              </button>

              {expanded && (
                <div className="pb-3 pl-6 pr-2">
                  <p className="text-xs text-muted mb-2">{r.note}</p>
                  <ul className="space-y-1.5">
                    {r.holdings.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-ink">{h.name}</span>
                        <span className="font-numeric text-muted shrink-0">
                          {pctLabel(h.pct)} · {maskAmount(h.value, currency, privacyMode, { fractionDigits: 0 })}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
