import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import Card from './Card';
import LoadingDots from '../LoadingDots';
import { cn } from './cn';

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Colours the value: profit/loss figures use positive/negative. */
  tone?: 'default' | 'positive' | 'negative';
  /** Change chip next to the value, e.g. { value: '13.2%', positive: true }. */
  delta?: { value: string; positive: boolean };
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
export default function StatCard({ label, value, tone = 'default', delta, sublabel, icon, loading, dense, hero, onToggle, toggled, className }: StatCardProps) {
  return (
    <Card padding="md" className={cn(dense && '!p-3 sm:!p-5', className)}>
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
      </div>
      <div className={cn('mt-2 flex items-baseline gap-2', hero ? 'min-h-9 sm:min-h-[28px]' : 'min-h-[28px]')}>
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
      {(sublabel || (!loading && delta)) && (
        <div className={cn('mt-1.5 flex items-center gap-2 text-xs text-muted', dense ? 'sm:min-h-[20px]' : 'min-h-[20px]')}>
          {!loading && delta && (
            <span
              className={cn(
                'font-medium px-1.5 py-0.5 rounded-md font-numeric',
                delta.positive ? 'bg-positive-soft text-positive' : 'bg-negative-soft text-negative'
              )}
            >
              {delta.positive ? '+' : '−'}
              {delta.value}
            </span>
          )}
          {sublabel && <span className="min-w-0">{sublabel}</span>}
        </div>
      )}
    </Card>
  );
}
