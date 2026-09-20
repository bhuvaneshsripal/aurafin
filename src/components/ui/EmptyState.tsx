import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Tighter padding, for empty states inside a card section. */
  compact?: boolean;
  className?: string;
}

/** "Nothing here yet" — says what's missing and offers the next step. */
export default function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center px-6',
        compact ? 'py-8' : 'py-14',
        className
      )}
    >
      {icon && (
        <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-muted">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-ink">{title}</p>
      {description && <p className="text-[13px] text-muted mt-1 max-w-sm">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
