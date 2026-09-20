import type { ReactNode } from 'react';
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
  /** Phones: smaller padding/value and no sublabel, so a strip of KPIs stays short. */
  dense?: boolean;
  className?: string;
}

const tones = { default: 'text-ink', positive: 'text-positive', negative: 'text-negative' };

/** KPI tile. Values are never truncated — long ₹ figures wrap instead of being cut off. */
export default function StatCard({ label, value, tone = 'default', delta, sublabel, icon, loading, dense, className }: StatCardProps) {
  return (
    <Card padding="md" className={cn(dense && '!p-3 sm:!p-5', className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-muted">{label}</span>
        {icon && <span className="text-faint shrink-0">{icon}</span>}
      </div>
      <div className="mt-2 min-h-[28px] flex items-baseline gap-2">
        {loading ? (
          <span className="h-7 flex items-center">
            <LoadingDots />
          </span>
        ) : (
          <span
            className={cn(
              'font-numeric leading-7 font-semibold tracking-tight break-words animate-value-in',
              dense ? 'text-lg sm:text-[22px]' : 'text-xl sm:text-[22px]',
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
          {sublabel && <span className={cn('min-w-0', dense && 'hidden sm:inline')}>{sublabel}</span>}
        </div>
      )}
    </Card>
  );
}
