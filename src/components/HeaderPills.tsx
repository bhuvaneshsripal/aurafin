import type { ReactNode } from 'react';

export type PillTone = 'brand' | 'red' | 'amber' | 'neutral';
const DOT: Record<PillTone, string> = {
  brand: 'bg-brand-600 dark:bg-brand-400',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  neutral: 'bg-slate-400',
};

export interface HeaderPill {
  /** Bold part, e.g. "40" or "₹1,59,960". */
  value: ReactNode;
  /** Plain part after it, e.g. "assets". */
  label?: ReactNode;
  tone?: PillTone;
  /** Colours the bold value green / red (for gains and losses). */
  valueTone?: 'positive' | 'negative';
}

/** The small rounded summary chips shown under a page title (same look as Liabilities / Net worth). */
export default function HeaderPills({ pills }: { pills: HeaderPill[] }) {
  return (
    <span className="flex flex-wrap items-center gap-2 mt-1.5">
      {pills.map((p, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs text-muted"
        >
          <span className={`h-1.5 w-1.5 rounded-full ${DOT[p.tone ?? 'brand']}`} />
          <b
            className={`font-semibold ${
              p.valueTone === 'positive' ? 'text-positive' : p.valueTone === 'negative' ? 'text-negative' : 'text-ink'
            }`}
          >
            {p.value}
          </b>
          {p.label != null && <> {p.label}</>}
        </span>
      ))}
    </span>
  );
}
