import type { HTMLAttributes } from 'react';
import LoadingDots from '../LoadingDots';
import { cn } from './cn';

/** Centered "working…" block for a card or page section. */
export default function LoadingState({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-12 text-muted', className)}>
      <LoadingDots />
      <span className="text-[13px]">{label}</span>
    </div>
  );
}

/** Placeholder block shown while a figure is still loading. */
export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn('skeleton-shimmer rounded-md', className)} {...rest} />;
}

/** Skeleton shaped like a stat card + a result card — use instead of a spinner while a page's figures load. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-3', className)}>
      <Skeleton className="h-3 w-1/3" />
      <Skeleton className="h-9 w-3/5 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 pt-1">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
    </div>
  );
}

/** Stat cards + a list card — the body of a page while its content is still loading. */
export function ContentSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-5', className)}>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-2xl" />
        ))}
      </div>
      <div className="space-y-3 rounded-2xl border border-line bg-surface p-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/5" />
            </div>
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Whole page while it loads: title, tab strip, then the body. Used wherever a page-level Suspense waits. */
export function PageSkeleton({ className }: { className?: string }) {
  return (
    <div role="status" aria-label="Loading" className={cn('space-y-5', className)}>
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-3.5 w-64 max-w-full" />
      </div>
      <div className="flex gap-5 overflow-hidden">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-5 w-20 shrink-0" />
        ))}
      </div>
      <ContentSkeleton />
    </div>
  );
}
