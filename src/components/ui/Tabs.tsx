import type { ReactNode } from 'react';
import { cn } from './cn';

export interface TabItem<T extends string = string> {
  key: T;
  label: ReactNode;
  count?: number;
}

/** Underline tabs — page-level sections (Assets / Liabilities / …). */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  return (
    <div className={cn('border-b border-line overflow-x-auto no-scrollbar', className)}>
      <div role="tablist" className="flex gap-1 min-w-max">
        {items.map((t) => {
          const active = t.key === value;
          return (
            <button
              key={t.key}
              role="tab"
              aria-selected={active}
              type="button"
              onClick={() => onChange(t.key)}
              className={cn(
                'keep-square relative -mb-px h-10 px-3 text-sm font-medium transition-colors duration-150 border-b-2',
                active
                  ? 'text-primary-ink border-brand-600 dark:border-brand-400'
                  : 'text-muted border-transparent hover:text-ink'
              )}
            >
              {t.label}
              {t.count !== undefined && (
                <span className="ml-1.5 text-xs font-normal text-faint">{t.count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Small segmented control — ranges (1M · 3M · 1Y), view toggles. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  className,
}: {
  items: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="group"
      className={cn('inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5', className)}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'rounded-md font-medium transition-colors duration-150',
              size === 'sm' ? 'h-6 px-2 text-xs' : 'h-7 px-2.5 text-[13px]',
              active
                ? 'bg-surface text-ink shadow-xs'
                : 'text-muted hover:text-ink'
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
