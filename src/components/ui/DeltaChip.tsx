import { cn } from './cn';

/** ▲ / ▼ glyph for gains and losses — shape carries the meaning, so it works without colour. */
export function TrendArrow({ up, className }: { up: boolean; className?: string }) {
  return (
    <span aria-hidden className={cn('inline-block text-[0.7em] leading-none', className)}>
      {up ? '▲' : '▼'}
    </span>
  );
}

/**
 * Small coloured chip: "▲ 0.4%" (green) or "▼ 1.2%" (red / amber).
 * `value` is the magnitude only ("0.4%"); the arrow carries the sign.
 */
export default function DeltaChip({
  value,
  positive,
  tone,
  className,
}: {
  value: string;
  positive: boolean;
  /** Override colour: 'warning' gives the amber chip used for "not so good" (not bad) values. */
  tone?: 'warning';
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 font-medium px-1.5 py-0.5 rounded-md font-numeric text-xs whitespace-nowrap',
        tone === 'warning'
          ? 'bg-warning-soft text-warning'
          : positive
            ? 'bg-positive-soft text-positive'
            : 'bg-negative-soft text-negative',
        className
      )}
    >
      <TrendArrow up={positive} />
      <span className="sr-only">{positive ? 'Up ' : 'Down '}</span>
      {value}
    </span>
  );
}
