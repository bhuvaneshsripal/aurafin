import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card, CardHeader } from './ui';
import InfoTip from './ui/InfoTip';
import { useUiStore } from '../store/uiStore';
import { maskAmount } from '../utils/currency';
import { buildCapAllocation, isSectorAsset } from '../utils/sectors';
import { useSectorProfiles } from '../hooks/useSectorProfiles';
import type { ValuedAsset } from '../utils/portfolioAnalytics';

const pctLabel = (p: number) => (p <= 0 ? '0%' : p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`);

/**
 * Market cap split — how much of your stocks and ETFs (at current value) sits
 * in large-cap, mid-cap and small-cap companies. Tap a row to see which of
 * your holdings fall in it.
 */
export default function MarketCapCard({ items, currency }: { items: ValuedAsset[]; currency: string }) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  const eligible = useMemo(() => items.filter((i) => isSectorAsset(i.asset)), [items]);
  const { profiles, loading } = useSectorProfiles(useMemo(() => eligible.map((i) => i.asset), [eligible]));
  const [open, setOpen] = useState<string | null>(null);
  const { total, rows } = useMemo(() => buildCapAllocation(eligible, profiles), [eligible, profiles]);
  const money = (v: number) => maskAmount(v, currency, privacyMode, { fractionDigits: 0 });

  return (
    <Card padding="lg" className="mt-4">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-1.5">
            Large, mid &amp; small cap
            <InfoTip>
              Company size by market value, following the usual India bands: large cap = the biggest ~100 companies
              (about ₹1,00,000 crore and above), mid cap = the next ~150 (about ₹30,000 crore and above), small cap =
              the rest. US stocks use $10B and $2B. ETFs are spread across many companies, so they are shown
              separately.
            </InfoTip>
          </span>
        }
        description={
          total > 0 ? `Share of ${money(total)} in stocks & ETFs` : 'Add stocks or ETFs to see your cap mix.'
        }
        actions={loading ? <span className="text-xs text-muted">Looking up company sizes…</span> : undefined}
      />

      {total > 0 && (
        <div className="mb-3 flex h-2.5 w-full overflow-hidden rounded-full bg-surface-hover" aria-hidden>
          {rows.map((r) => (
            <span key={r.key} style={{ width: `${r.pct}%`, background: r.color }} />
          ))}
        </div>
      )}

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
                <span className="flex-1 min-w-0">
                  <span className={`block text-sm truncate ${held ? 'text-ink font-medium' : 'text-muted'}`}>{r.label}</span>
                  <span className="block text-[11px] text-muted truncate">{r.hint}</span>
                </span>
                <span className={`font-numeric text-xs text-right ${held ? 'text-muted' : 'text-muted/60'}`}>{money(r.value)}</span>
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
                  <ul className="space-y-1.5">
                    {r.holdings.map((h) => (
                      <li key={h.id} className="flex items-center justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-ink">{h.name}</span>
                        <span className="font-numeric text-muted shrink-0">
                          {pctLabel(h.pct)} · {money(h.value)}
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
