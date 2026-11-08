import { useState } from 'react';
import { Badge, cn } from './ui';
import { money, type Exchange } from '../utils/valuation';

/**
 * The headline of a valuation: a status chip plus a visual showing where the
 * current price (CMP) sits against X, X/2 and X/3. Three views, switchable and
 * remembered per device:
 *   gauge  – a dial from deep value to expensive, with a needle at CMP
 *   ladder – horizontal bars to scale (CMP, X, X/2, X/3)
 *   zones  – the original bar split into deep value · target · expensive
 */

type View = 'gauge' | 'ladder' | 'zones';
const VIEWS: { id: View; label: string }[] = [
  { id: 'gauge', label: 'Gauge' },
  { id: 'ladder', label: 'Ladder' },
  { id: 'zones', label: 'Zones' },
];
const STORAGE_KEY = 'aurafin.valuationView';

function loadView(): View {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'gauge' || v === 'ladder' || v === 'zones') return v;
  } catch {
    /* storage blocked – fall through */
  }
  return 'gauge';
}

export default function ValuationBar({
  name,
  price,
  x2,
  x3,
  unreliable,
  exchange = 'NSE',
}: {
  exchange?: Exchange;
  name: string;
  price: number;
  x2: number;
  x3: number;
  unreliable?: boolean;
}) {
  const [view, setView] = useState<View>(loadView);
  const fmt = (n: number) => money(n, exchange);

  if (!(price > 0) || !(x2 > 0) || !(x3 > 0)) return null;

  const pick = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const status =
    price <= x3 ? { label: 'Deep value', good: true } : price <= x2 ? { label: 'Undervalued', good: true } : { label: 'Expensive', good: false };

  const belowX2 = ((x2 - price) / x2) * 100;
  const vsX3 = ((price - x3) / x3) * 100;
  const farAbove = price > x2 * 2;
  const summary = farAbove
    ? `${(price / x2).toFixed(0)}x above X/2`
    : price > x2
      ? `CMP is ${Math.abs(belowX2).toFixed(0)}% above X/2`
      : price >= x3
        ? `CMP is ${belowX2.toFixed(0)}% below X/2 · ${vsX3.toFixed(0)}% above X/3`
        : `CMP is ${(((x3 - price) / x3) * 100).toFixed(0)}% below X/3`;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="min-w-0 break-words text-lg font-semibold tracking-tight text-ink">{name}</h2>
        <Badge variant={status.good ? 'success' : 'warning'} className="!rounded-full px-2.5">{status.label}</Badge>
        {unreliable && <Badge variant="warning" className="!rounded-full px-2.5">Unreliable</Badge>}
        <div role="group" aria-label="Valuation view" className="ml-auto inline-flex rounded-full bg-surface-muted p-0.5 text-xs font-semibold">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => pick(v.id)}
              className={cn(
                'min-h-8 rounded-full px-3 py-1.5 transition-colors',
                view === v.id ? 'bg-brand-600 text-white dark:bg-brand-500' : 'text-muted hover:text-ink',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {view === 'gauge' && <Gauge price={price} x2={x2} x3={x3} status={status} summary={summary} fmt={fmt} />}
      {view === 'ladder' && <Ladder price={price} x2={x2} x3={x3} status={status} summary={summary} fmt={fmt} />}
      {view === 'zones' && <Zones price={price} x2={x2} x3={x3} status={status} summary={summary} fmt={fmt} />}
    </div>
  );
}

type ViewProps = {
  price: number;
  x2: number;
  x3: number;
  status: { label: string; good: boolean };
  summary: string;
  fmt: (n: number) => string;
};

/* ── Style A: gauge ─────────────────────────────────────────────────────── */

const CX = 120;
const CY = 120;
const R = 90;

/** Point on the dial at fraction t (0 = far left, 1 = far right). */
function dialPoint(t: number, radius: number) {
  const a = Math.PI * (1 - t);
  return { x: CX + radius * Math.cos(a), y: CY - radius * Math.sin(a) };
}

function arc(t1: number, t2: number) {
  const a = dialPoint(t1, R);
  const b = dialPoint(t2, R);
  return `M ${a.x.toFixed(2)} ${a.y.toFixed(2)} A ${R} ${R} 0 0 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
}

function Gauge({ price, x2, x3, status, summary, fmt }: ViewProps) {
  // Dial runs from 0 to 1.5 × X/2, so the expensive zone gets a third of it.
  const max = x2 * 1.5;
  const t3 = x3 / max;
  const t2 = x2 / max;
  const offScale = price > max;
  const tp = Math.min(1, Math.max(0, price / max));
  const tip = dialPoint(tp, R - 26);
  const gap = 0.006;

  return (
    <div className="mt-2">
      <div role="img" aria-label={`${status.label}. ${summary}${offScale ? ', off the scale' : ''}`} className="mx-auto max-w-xs">
        <svg viewBox="0 0 240 150" className="block w-full" aria-hidden>
          <path d={arc(0, t3 - gap)} fill="none" strokeWidth={18} className="stroke-brand-600 dark:stroke-brand-500" />
          <path d={arc(t3 + gap, t2 - gap)} fill="none" strokeWidth={18} className="stroke-emerald-300 dark:stroke-emerald-400/70" />
          <path d={arc(t2 + gap, 1)} fill="none" strokeWidth={18} className="stroke-amber-400 dark:stroke-amber-400/80" />
          <line x1={CX} y1={CY} x2={tip.x} y2={tip.y} strokeWidth={3} strokeLinecap="round" className="stroke-ink" />
          <circle cx={CX} cy={CY} r={6} className="fill-ink" />
          <text x={dialPoint(0, R).x} y={142} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-muted">Deep value</text>
          <text x={dialPoint(1, R).x} y={142} textAnchor="middle" fontSize={10} fontWeight={600} className="fill-muted">Expensive</text>
        </svg>
      </div>
      <div className="-mt-1 text-center">
        <div className="text-2xl font-semibold text-ink font-numeric">{fmt(price)}</div>
        <p className={cn('mt-0.5 text-sm font-semibold', status.good ? 'text-positive' : 'text-warning')}>
          {summary}
          {offScale && ' · off the scale'}
        </p>
        <p className="mt-1 text-xs text-muted font-numeric">
          X/3 {fmt(x3)} · X/2 {fmt(x2)} · X {fmt(x2 * 2)}
        </p>
      </div>
    </div>
  );
}

/* ── Style B: price ladder ──────────────────────────────────────────────── */

function Ladder({ price, x2, x3, status, summary, fmt }: ViewProps) {
  const x = x2 * 2;
  const max = Math.max(price, x);
  const width = (v: number) => `${Math.max(2.5, (v / max) * 100)}%`;
  const rows = [
    { label: 'CMP', value: price, bar: status.good ? 'bg-brand-600 dark:bg-brand-500' : 'bg-amber-600 dark:bg-amber-500' },
    { label: 'X', value: x, bar: 'bg-lime-400 dark:bg-lime-400/70' },
    { label: 'X/2', value: x2, bar: 'bg-emerald-300 dark:bg-emerald-400/70' },
    { label: 'X/3', value: x3, bar: 'bg-brand-600 dark:bg-brand-500' },
  ];

  return (
    <div className="mt-4" role="img" aria-label={`${status.label}. ${summary}`}>
      <div className="space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <span className="w-9 shrink-0 text-xs font-semibold text-muted">{r.label}</span>
            <div className="min-w-0 flex-1">
              <div className={cn('h-3 rounded-full', r.bar)} style={{ width: width(r.value) }} />
            </div>
            <span className="w-[4.75rem] shrink-0 text-right text-xs font-semibold text-ink font-numeric sm:w-24">{fmt(r.value)}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">Bars are to scale, so the gap is obvious</p>
      <p className={cn('mt-1 text-sm font-semibold', status.good ? 'text-positive' : 'text-warning')}>{summary}</p>
    </div>
  );
}

/* ── Zones: the original bar ────────────────────────────────────────────── */

function Zones({ price, x2, x3, status, summary, fmt }: ViewProps) {
  // Scale: leave room above X/2 for the "expensive" zone and for a CMP beyond it.
  const max = Math.max(x2 * 1.5, price * 1.12);
  const pos = (v: number) => `${Math.min(100, Math.max(0, (v / max) * 100))}%`;
  // Keep labels inside the card even when a mark sits at an edge.
  const labelPos = (v: number) => `${Math.min(88, Math.max(12, (v / max) * 100))}%`;

  return (
    <div>
      <p className="mt-1 text-sm text-muted font-numeric font-normal">
        CMP {fmt(price)} · X {fmt(x2 * 2)}
      </p>

      <div className="mt-5" />

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

      {/* CMP label under its tick. */}
      <div className="relative mt-1.5 h-4">
        <span
          className="absolute -translate-x-1/2 whitespace-nowrap text-xs font-semibold text-ink font-numeric"
          style={{ left: labelPos(price) }}
        >
          CMP
        </span>
      </div>

      {/* Zone key: prices live here (not on the bar) so labels never collide. */}
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {[
          { swatch: 'bg-brand-600 dark:bg-brand-500', title: 'Deep value', sub: `below ${fmt(x3)}` },
          { swatch: 'bg-emerald-300 dark:bg-emerald-400/60', title: 'Target', sub: `${fmt(x3)} – ${fmt(x2)}` },
          { swatch: 'bg-amber-200 dark:bg-amber-400/40', title: 'Expensive', sub: `above ${fmt(x2)}` },
        ].map((z) => (
          <div key={z.title} className="min-w-0 rounded-xl bg-surface-muted px-1.5 py-2">
            <span aria-hidden className={cn('mx-auto mb-1 block h-1.5 w-8 rounded-full', z.swatch)} />
            <div className="text-xs font-semibold text-ink">{z.title}</div>
            <div className="mt-0.5 break-words text-[11px] leading-tight text-muted font-numeric">{z.sub}</div>
          </div>
        ))}
      </div>

      <p className={cn('mt-4 text-sm font-semibold', status.good ? 'text-positive' : 'text-warning')}>{summary}</p>
    </div>
  );
}
