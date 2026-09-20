import type { HTMLAttributes } from 'react';
import { cn } from './cn';

export type BadgeVariant = 'neutral' | 'brand' | 'success' | 'danger' | 'warning' | 'info';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  brand: 'bg-primary-soft text-primary-ink',
  success: 'bg-positive-soft text-positive',
  danger: 'bg-negative-soft text-negative',
  warning: 'bg-warning-soft text-warning',
  info: 'bg-accent-50 text-accent-700 dark:bg-accent-500/15 dark:text-accent-300',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Leading status dot. */
  dot?: boolean;
}

/** Compact status/label chip. Square-ish (not a pill) to match the rest of the UI. */
export default function Badge({ variant = 'neutral', dot, className, children, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap',
        variants[variant],
        className
      )}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
