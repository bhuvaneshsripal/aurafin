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
  return <div className={cn('animate-pulse rounded-md bg-slate-100 dark:bg-slate-800', className)} {...rest} />;
}
