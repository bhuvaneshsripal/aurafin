import type { ReactNode } from 'react';
import { cn } from './cn';

/** Circular progress: how far along a target you are. */
export default function ProgressRing({
  percent,
  size = 64,
  stroke = 8,
  className,
  children,
}: {
  percent: number;
  size?: number;
  stroke?: number;
  className?: string;
  /** Centre content; defaults to "62%". */
  children?: ReactNode;
}) {
  const pct = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={cn('relative shrink-0', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-700" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct / 100)}
          className="stroke-brand-600 dark:stroke-brand-400 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[13px] font-semibold font-numeric text-ink">
        {children ?? `${Math.round(pct)}%`}
      </span>
    </div>
  );
}
