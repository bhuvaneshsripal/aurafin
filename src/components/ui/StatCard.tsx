import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import Card from './Card';
import LoadingDots from '../LoadingDots';
import { cn } from './cn';
import DeltaChip from './DeltaChip';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Colours the value: profit/loss figures use positive/negative. */
  tone?: 'default' | 'positive' | 'negative';
  /** Change chip next to the value, e.g. { value: '13.2%', positive: true } → "▲ 13.2%". Pass the magnitude only. */
  delta?: { value: string; positive: boolean };
  /** Show the change chip at the top right of the card instead of under the value. */
  deltaInCorner?: boolean;
  /** Small neutral tag at the top right (e.g. "Realized"). */
  cornerLabel?: ReactNode;
  sublabel?: ReactNode;
  icon?: ReactNode;
  loading?: boolean;
  /** Larger value for the one number the page is about (Net worth). */
  hero?: boolean;
  /** Phones: smaller padding/value and no sublabel, so a strip of KPIs stays short. */
  dense?: boolean;
  /** When set, a small arrow next to the label calls this on click. The
   *  parent swaps the card's values in place (no separate panel). */
  onToggle?: () => void;
  /** Arrow state for `onToggle` (points up when true). */
  toggled?: boolean;
  className?: string;
}

const tones = { default: 'text-ink', positive: 'text-positive', negative: 'text-negative' };

/** KPI tile. Values are never truncated — long ₹ figures wrap instead of being cut off. */
export default function StatCard({ label, value, tone = 'default', delta, deltaInCorner, cornerLabel, sublabel, icon, loading, dense, hero, onToggle, toggled, className }: StatCardProps) {
  return (
    <Card padding="md" className={cn(dense && (hero ? '!p-5 sm:!p-5' : '!p-3 sm:!p-5'), className)}>
      <div className="flex items-center justify-between gap-2 min-h-6">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-pressed={!!toggled}
            aria-label={toggled ? 'Show current values' : 'Include sold investments'}
            className="ml-auto -mr-1 p-1 rounded-md text-faint hover:text-ink hover:bg-surface-hover transition-colors"
          >
            <ChevronDown size={16} className={cn('transition-transform', toggled && 'rotate-180')} />
          </button>
        )}
        {icon && <span className="text-faint shrink-0">{icon}</span>}
        {cornerLabel && !(deltaInCorner && !loading && delta) && (
          <span className="ml-auto shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-md bg-surface-muted text-muted">
            {cornerLabel}
          </span>
        )}
        {deltaInCorner && !loading && delta && (
          <span className="ml-auto shrink-0">
            <DeltaChip value={delta.value} positive={delta.positive} />
          </span>
        )}
      </div>
      <div className={cn('flex items-baseline gap-2', hero ? 'mt-4 sm:mt-2 mb-1 sm:mb-0 min-h-10 sm:min-h-[28px]' : 'mt-2 min-h-[28px]')}>
        {loading ? (
          <span className="h-7 flex items-center">
            <LoadingDots />
          </span>
        ) : (
          <span
            className={cn(
              'font-numeric leading-7 font-semibold tracking-tight break-words animate-value-in',
              hero ? 'text-[32px] leading-9 sm:text-[22px] sm:leading-7' : dense ? 'text-lg sm:text-[22px]' : 'text-xl sm:text-[22px]',
              tones[tone]
            )}
          >
            {value}
          </span>
        )}
      </div>
      {(sublabel || (!loading && delta && !deltaInCorner)) && (
        <div className={cn('mt-1.5 flex items-center gap-2 text-xs text-muted', dense ? 'sm:min-h-[20px]' : 'min-h-[20px]')}>
          {!loading && delta && !deltaInCorner && <DeltaChip value={delta.value} positive={delta.positive} />}
          {sublabel && <span className="min-w-0">{sublabel}</span>}
        </div>
      )}
    </Card>
  );
}
