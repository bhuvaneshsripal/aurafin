import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Amount from '../../components/Amount';
import { hideNumber } from '../../utils/privateFormat';
import type { CategoryBreakdown as Category } from '../../utils/portfolioAnalytics';

/** Category rows (Equity, Debt, …). Tap a category with more than one asset class to see Direct Stock / ETF / SIP etc. inside it. */
export default function CategoryBreakdownList({ categories, currency, defaultOpen = [] }: { categories: Category[]; currency: string; defaultOpen?: string[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(defaultOpen.map((k) => [k, true])));

  return (
    <ul className="divide-y divide-line-soft">
      {categories.map((c) => {
        const expandable = c.children.length > 1;
        const isOpen = !!open[c.key];
        return (
          <li key={c.key}>
            <button
              type="button"
              disabled={!expandable}
              onClick={() => setOpen((o) => ({ ...o, [c.key]: !o[c.key] }))}
              className="w-full flex items-center justify-between gap-3 py-2.5 text-sm text-left disabled:cursor-default"
            >
              <span className="flex items-center gap-2 text-ink">
                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: c.color }} />
                {c.label}
                {expandable && <ChevronDown size={14} className={`text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`} />}
              </span>
              <span className="text-muted whitespace-nowrap">
                <Amount value={c.value} currency={currency} /> · {hideNumber(`${c.pct.toFixed(1)}%`)}
              </span>
            </button>
            {expandable && isOpen && (
              <ul className="pb-2.5 pl-5 space-y-1.5">
                {c.children.map((s) => (
                  <li key={s.assetClass} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="flex items-center gap-2 text-ink-2 min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="text-muted whitespace-nowrap">
                      <Amount value={s.value} currency={currency} /> · {hideNumber(`${s.pctOfCategory.toFixed(0)}% of ${c.label}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
