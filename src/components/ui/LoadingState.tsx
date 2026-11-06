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
