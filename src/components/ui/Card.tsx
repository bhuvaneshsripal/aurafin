import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Padding = 'none' | 'sm' | 'md' | 'lg';
const pad: Record<Padding, string> = { none: '', sm: 'p-4', md: 'p-4 sm:p-5', lg: 'p-5' };

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: Padding;
}

/** The one surface: white, no outline, a soft shadow and generous corners.
 *  In dark mode it is a raised charcoal card with a thin light border instead. */
export default function Card({ padding = 'md', className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'bg-surface rounded-[20px] shadow-card min-w-0',
        'dark:bg-surface-muted dark:border dark:border-white/10 dark:shadow-none',
        pad[padding],
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Draw a hairline under the header (use when the card body is `padding="none"`). */
  divided?: boolean;
  /** Add its own padding (use when the card is `padding="none"`). */
  padded?: boolean;
  className?: string;
}

export function CardHeader({ title, description, actions, divided, padded, className }: CardHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-3 mb-4',
        padded && 'px-5 pt-5',
        divided && 'pb-4 mb-0 border-b border-line-soft',
        className
      )}
    >
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
        {description && <p className="text-[13px] text-muted mt-0.5">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
