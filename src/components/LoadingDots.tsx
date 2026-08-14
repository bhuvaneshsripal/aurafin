/** Three dots fading/bouncing in sequence — a lightweight "still working"
 *  indicator for values waiting on a live network round-trip (a real
 *  server-confirmed total, a live price fetch, etc). Used anywhere a
 *  headline number would otherwise flash `0`/empty for a moment before the
 *  real data arrives — most noticeable on a slower mobile connection where
 *  that window is longer. */
export default function LoadingDots({ className = '' }: { className?: string }) {
  return (
    <span className={`loading-dots inline-flex items-center gap-1 ${className}`} role="status" aria-label="Loading">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 inline-block" />
    </span>
  );
}
