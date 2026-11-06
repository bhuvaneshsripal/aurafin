import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from './cn';

/** "2h ago", "35m ago", "3d ago". */
export function timeAgo(ts: number, now = Date.now()): string {
  const mins = Math.max(0, Math.floor((now - ts) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Re-renders once a minute so "2h ago" stays honest. */
function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

/**
 * Soft amber line shown when quotes are old: "Prices updated 2h ago · Refresh".
 * Renders nothing while `updatedAt` is missing or newer than `staleAfterMs`.
 */
export default function StaleBanner({
  updatedAt,
  onRefresh,
  staleAfterMs = 30 * 60_000,
  label = 'Prices updated',
  className,
}: {
  updatedAt: number | null | undefined;
  onRefresh?: () => void;
  staleAfterMs?: number;
  label?: string;
  className?: string;
}) {
  const now = useNow();
  if (!updatedAt || now - updatedAt < staleAfterMs) return null;
  return (
    <div
      role="status"
      className={cn(
        'flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-700',
        'dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
        className
      )}
    >
      <AlertTriangle size={14} className="shrink-0" />
      <span className="min-w-0">
        {label} {timeAgo(updatedAt, now)}
      </span>
      {onRefresh && (
        <>
          <span aria-hidden>·</span>
          <button type="button" onClick={onRefresh} className="font-semibold underline-offset-2 hover:underline">
            Refresh
          </button>
        </>
      )}
    </div>
  );
}
