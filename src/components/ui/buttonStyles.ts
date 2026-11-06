import { cn } from './cn';

export type ButtonVariant = 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger' | 'danger-solid';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium select-none ' +
  'transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-brand-600 text-white shadow-[0_4px_12px_-2px_rgb(36_122_77/0.35)] hover:bg-brand-700 active:bg-brand-800',
  secondary:
    'bg-surface text-ink-2 border border-line shadow-xs hover:bg-surface-hover hover:border-slate-300',
  /** Pale green: the quiet partner of a solid primary (e.g. Change PIN next to Lock Now). */
  soft: 'bg-primary-soft text-primary-ink hover:bg-brand-100 dark:hover:bg-brand-500/25 active:opacity-90',
  ghost: 'text-muted hover:bg-surface-hover hover:text-ink',
  danger: 'bg-negative-soft text-negative hover:bg-red-100 dark:hover:bg-red-500/20 active:opacity-90',
  'danger-solid': 'bg-red-500 text-white shadow-xs hover:bg-red-600',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 sm:h-8 px-3 text-[13px]',
  md: 'h-10 sm:h-9 px-3.5 text-sm',
  lg: 'h-11 sm:h-10 px-4 text-sm',
};

/** Class string for anything that should *look* like a Button (e.g. a router <Link>). */
export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string
) {
  return cn(base, variants[variant], sizes[size], className);
}
