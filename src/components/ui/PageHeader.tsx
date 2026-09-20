import type { ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from './cn';

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Small line under the description (e.g. a live-data indicator). */
  meta?: ReactNode;
  actions?: ReactNode;
  /** Keep actions on the title's row on phones (for one or two small icon buttons). */
  actionsInline?: boolean;
  onBack?: () => void;
  backLabel?: string;
  className?: string;
}

/** Every page opens with this: one title size, one description style, actions on the right. */
export default function PageHeader({
  title,
  description,
  meta,
  actions,
  actionsInline,
  onBack,
  backLabel = 'Back',
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        'flex sm:flex-row sm:items-start sm:justify-between gap-3 mb-5 sm:mb-6',
        actionsInline ? 'flex-row items-start justify-between' : 'flex-col',
        className
      )}
    >
      <div className="min-w-0 flex-1">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink mb-2 transition-colors"
          >
            <ArrowLeft size={14} /> {backLabel}
          </button>
        )}
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description && <p className="text-sm text-muted mt-1">{description}</p>}
        {meta && <div className="mt-1.5">{meta}</div>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap sm:shrink-0">{actions}</div>}
    </div>
  );
}
