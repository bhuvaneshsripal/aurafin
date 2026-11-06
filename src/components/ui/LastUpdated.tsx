import { ArrowDown } from 'lucide-react';
import { cn } from './cn';

/** "↓ Pull to refresh" with "Updated 12:07 pm" underneath. Shown at the foot of the main pages. */
export default function LastUpdated({
  updatedAt,
  className,
}: {
  updatedAt: number | null | undefined;
  className?: string;
}) {
  const time = updatedAt
    ? new Date(updatedAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(/\s?([AP])M/i, (_, a) => ` ${a.toLowerCase()}m`)
    : null;
  return (
    <div className={cn('flex flex-col items-center gap-0.5 pt-2 pb-1 text-xs text-muted', className)}>
      <span className="inline-flex items-center gap-1 md:hidden">
        <ArrowDown size={12} aria-hidden /> Pull to refresh
      </span>
      {time && <span className="font-semibold text-ink-2">Updated {time}</span>}
    </div>
  );
}
