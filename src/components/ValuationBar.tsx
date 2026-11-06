import { Badge, cn } from './ui';
import { inr } from '../utils/valuation';

/**
 * The headline of a valuation: a status chip, then a bar split into
 * deep value (below X/3) · target (X/3 to X/2) · expensive (above X/2),
 * with X/3, X/2 and the current price (CMP) marked on it.
 */
export default function ValuationBar({
  name,
  price,
  x2,
  x3,
  unreliable,
}: {
  name: string;
  price: number;
  x2: number;
  x3: number;
  unreliable?: boolean;
}) {
  if (!(price > 0) || !(x2 > 0) || !(x3 > 0)) return null;

  const status =
    price <= x3 ? { label: 'Deep value', good: true } : price <= x2 ? { label: 'Undervalued', good: true } : { label: 'Expensive', good: false };

  // Scale: leave room above X/2 for the "expensive" zone and for a CMP beyond it.
  const max = Math.max(x2 * 1.5, price * 1.12);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  // Keep labels inside the card even when a mark sits at an edge.
  const labelPos = (v: number) => `${Math.min(88, Math.max(12, (v / max) * 100))}%`;

  const belowX2 = ((x2 - price) / x2) * 100;
  const vsX3 = ((price - x3) / x3) * 100;
  const summary =
    price > x2
      ? `CMP is ${Math.abs(belowX2).toFixed(0)}% above X/2`
      : price >= x3
        ? `CMP is ${belowX2.toFixed(0)}% below X/2 · ${vsX3.toFixed(0)}% above X/3`
        : `CMP is ${((x3 - price) / x3 * 100).toFixed(0)}% below X/3`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight text-ink">{name}</h2>
        <Badge variant={status.good ? 'success' : 'warning'} className="!rounded-full px-2.5">{status.label}</Badge>
        {unreliable && <Badge variant="warning" className="!rounded-full px-2.5">Unreliable</Badge>}
      </div>
      <p className="mt-1 text-sm text-muted font-numeric font-normal">
        CMP {inr(price)} · X {inr(x2 * 2)}
      </p>

      {/* Marks above the bar: X/3 and X/2 with their prices. */}
      <div className="relative mt-4 h-9">
        {[{ k: 'X/3', v: x3 }, { k: 'X/2 Target', v: x2 }].map((m) => (
          <div
            key={m.k}
            className="absolute bottom-0 -translate-x-1/2 text-center text-xs font-semibold leading-tight text-ink font-numeric"
            style={{ left: labelPos(m.v) }}
          >
            {inr(m.v)}
            <br />
            {m.k}
          </div>
        ))}
      </div>

      <div className="relative" role="img" aria-label={`${status.label}. ${summary}`}>
        <div className="flex h-3 overflow-hidden rounded-full">
          <div className="bg-brand-600 dark:bg-brand-500" style={{ width: pos(x3) }} />
          <div className="bg-emerald-300 dark:bg-emerald-400/60" style={{ width: `calc(${pos(x2)} - ${pos(x3)})` }} />
          <div className="flex-1 bg-amber-200 dark:bg-amber-400/40" />
        </div>
        {/* Tick marks for X/3, X/2 and CMP. */}
        {[x3, x2].map((v) => (
          <span key={v} aria-hidden className="absolute -top-1.5 h-[calc(100%+0.75rem)] w-0.5 -translate-x-1/2 rounded bg-ink" style={{ left: pos(v) }} />
        ))}
        <span
          aria-hidden
          className={cn('absolute -top-2 h-[calc(100%+1rem)] w-[3px] -translate-x-1/2 rounded', status.good ? 'bg-ink' : 'bg-amber-600')}
          style={{ left: pos(price) }}
        />
      </div>

      {/* CMP label under its tick, then the zone names. */}
      <div className="relative mt-1.5 h-4">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-ink font-numeric"
          style={{ left: labelPos(price) }}
        >
          CMP
        </span>
      </div>
      <div className="mt-0.5 flex justify-between text-xs text-muted">
        <span>Deep value</span>
        <span>Target</span>
        <span>Expensive</span>
      </div>

      <p className={cn('mt-3 text-sm font-semibold', status.good ? 'text-positive' : 'text-warning')}>{summary}</p>
    </div>
  );
}
