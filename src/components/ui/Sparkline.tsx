import { cn } from './cn';

/**
 * Tiny trend chart for list rows. Pass a few recent values (oldest first);
 * it is drawn as little rising/falling bars so it stays legible at 40px wide.
 * Colour follows the direction (last vs first) unless `tone` is given.
 */
export default function Sparkline({
  values,
  tone,
  className,
  label = 'Recent trend',
}: {
  values: number[];
  tone?: 'positive' | 'negative' | 'neutral';
  className?: string;
  label?: string;
}) {
  const v = values.filter((n) => Number.isFinite(n));
  if (v.length < 2) return null;
  const min = Math.min(...v);
  const max = Math.max(...v);
  const span = max - min || 1;
  const dir = tone ?? (v[v.length - 1] > v[0] ? 'positive' : v[v.length - 1] < v[0] ? 'negative' : 'neutral');
  const color = dir === 'positive' ? 'bg-emerald-500/70' : dir === 'negative' ? 'bg-red-500/70' : 'bg-slate-400/70';
  return (
    <span role="img" aria-label={label} className={cn('inline-flex h-6 items-end gap-[3px]', className)}>
      {v.map((n, i) => (
        <span
          key={i}
          className={cn('w-[5px] rounded-[2px]', color, i === v.length - 1 && '!opacity-100')}
          style={{ height: `${25 + ((n - min) / span) * 75}%` }}
        />
      ))}
    </span>
  );
}
