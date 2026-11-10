import type { ReactNode } from 'react';

/** Small shared pieces for the time-series area charts (Net Worth History, Portfolio Performance).
 *
 *  Why a time axis: the charts used to put one equal-width slot per data point, so a 1-day gap and a
 *  3-month gap took the same width and the x-axis labels were unevenly spaced in real time. These
 *  helpers let the charts use a real numeric time axis, so the horizontal distance is the time. */

export const DAY_MS = 86_400_000;

/** "YYYY-MM-DD" -> local midnight in ms. */
export const isoToMs = (iso: string): number => new Date(`${iso}T00:00:00`).getTime();

const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60];
const DAY_STEPS = [1, 2, 3, 7, 14];

/** Evenly spaced, calendar-aware ticks for [min, max] (ms): day steps for short spans, month starts
 *  for long ones. Never returns more than about `target + 1` ticks. */
export function niceTimeTicks(min: number, max: number, target = 6): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return Number.isFinite(min) ? [min] : [];
  const spanDays = (max - min) / DAY_MS;
  const ticks: number[] = [];
  if (spanDays <= target * 14) {
    const step = DAY_STEPS.find((d) => spanDays / d <= target) ?? 14;
    for (let t = min; t <= max + 1; t += step * DAY_MS) ticks.push(t);
    return ticks;
  }
  const spanMonths = spanDays / 30.44;
  const stepM = MONTH_STEPS.find((m) => spanMonths / m <= target) ?? 60;
  const d = new Date(min);
  let cursor = new Date(d.getFullYear(), d.getMonth(), 1);
  if (cursor.getTime() < min) cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  while (cursor.getTime() <= max) {
    ticks.push(cursor.getTime());
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + stepM, 1);
  }
  return ticks;
}

const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' });
const monthYearFmt = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });
const longFmt = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

/** Tick label: "9 Nov" for spans under ~a year, "Nov ’26" beyond. */
export const makeTickFormatter = (min: number, max: number) => {
  const long = (max - min) / DAY_MS > 400;
  return (ms: number) => (long ? monthYearFmt : shortFmt).format(new Date(ms)).replace(' 20', " ’");
};
export const formatLongDate = (ms: number): string => longFmt.format(new Date(ms));

/** A little headroom so the line never touches the top/bottom edge, and a clean zero when the data crosses it. */
export function paddedDomain(values: number[], padFraction = 0.08): [number, number] {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) return [0, 1];
  const lo = Math.min(...finite);
  const hi = Math.max(...finite);
  if (lo === hi) {
    const pad = Math.abs(hi) * 0.03 || 1;
    return [lo - pad, hi + pad];
  }
  const pad = (hi - lo) * padFraction;
  const bottom = lo >= 0 && lo - pad < 0 ? 0 : lo - pad;
  return [bottom, hi + pad];
}

/** Vertical colour fade for an area fill: strong under the line, transparent at the bottom. */
export function AreaGradient({ id, color, top = 0.32, bottom = 0.02 }: { id: string; color: string; top?: number; bottom?: number }) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={top} />
      <stop offset="100%" stopColor={color} stopOpacity={bottom} />
    </linearGradient>
  );
}

/** `dot` renderer for recharts <Area>: draws nothing except a pulsing "live" dot on the last point. */
export function liveEndDot(color: string, lastIndex: number) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (props: any): ReactNode => {
    const { cx, cy, index, key } = props;
    if (index !== lastIndex || typeof cx !== 'number' || typeof cy !== 'number') return <g key={key} />;
    return (
      <g key={key}>
        <circle cx={cx} cy={cy} r={9} fill={color} opacity={0.18}>
          <animate attributeName="r" values="5;11;5" dur="2.4s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.28;0;0.28" dur="2.4s" repeatCount="indefinite" />
        </circle>
        <circle cx={cx} cy={cy} r={4.5} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
      </g>
    );
  };
}

/** Tooltip card: date, a big value, and the change against the first point of the visible range. */
export function ChartTooltipCard({
  dateMs,
  label,
  value,
  color,
  delta,
  deltaPct,
}: {
  dateMs: number;
  label: string;
  value: string;
  color: string;
  delta?: string;
  deltaPct?: string;
}) {
  const up = delta ? !delta.trim().startsWith('−') && !delta.trim().startsWith('-') : true;
  return (
    <div
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-line)',
        borderRadius: 14,
        boxShadow: '0 12px 32px -10px rgba(0,0,0,0.28)',
        padding: '10px 12px',
        minWidth: 150,
        fontSize: 12,
        color: 'var(--color-ink)',
      }}
    >
      <div style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{formatLongDate(dateMs)}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, color: 'var(--color-muted)' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: color, display: 'inline-block' }} />
        {label}
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--color-ink)', marginTop: 1, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      {delta && (
        <div style={{ marginTop: 4, fontWeight: 600, color: up ? 'var(--color-positive, #1b7f4b)' : 'var(--color-negative, #dc3545)', fontVariantNumeric: 'tabular-nums' }}>
          {delta}
          {deltaPct ? ` · ${deltaPct}` : ''}
          <span style={{ color: 'var(--color-muted)', fontWeight: 500 }}> since start</span>
        </div>
      )}
    </div>
  );
}
