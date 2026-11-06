import { useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';

export interface RingItem {
  key: string;
  label: string;
  value: number;
  color: string;
}

const OTHER_KEY = '__other';
const OTHER_COLOR = '#94a3b8';

const defaultPercent = (p: number) => `${p >= 10 ? p.toFixed(0) : p.toFixed(1)}%`;

/**
 * Concentric rings, like Apple's Activity rings: one ring per category, biggest on the
 * outside. Each ring's arc length is that category's share of the whole (46% → a bit
 * under half a circle). The centre shows the share + name of the active ring (hovered,
 * selected, or — by default — the largest).
 *
 * Replaces the old donut/pie charts everywhere in the app.
 */
export default function ConcentricRings({
  items,
  size = 200,
  maxRings = 8,
  activeKey,
  onActiveChange,
  onSelect,
  selectedKey,
  formatPercent = defaultPercent,
  centerExtra,
  trackClassName = 'stroke-slate-100 dark:stroke-slate-800',
  className,
}: {
  items: RingItem[];
  /** Rendered diameter in px (scales down on narrow containers). */
  size?: number;
  /** Rings beyond this are merged into one grey "Other" ring so they stay readable. */
  maxRings?: number;
  /** Controlled highlight (e.g. from a hovered legend row). Leave undefined to let the chart manage it. */
  activeKey?: string | null;
  onActiveChange?: (key: string | null) => void;
  /** Click / Enter / Space on a ring. */
  onSelect?: (key: string) => void;
  /** A "pinned" ring: everything else is dimmed. */
  selectedKey?: string | null;
  /** Format the % in the centre — pass a privacy-aware formatter where needed. */
  formatPercent?: (pct: number) => string;
  /** Small extra line under the label in the centre (e.g. an amount). */
  centerExtra?: (item: RingItem & { pct: number }) => ReactNode;
  /** Tailwind stroke classes for the empty track behind each ring. */
  trackClassName?: string;
  className?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);

  const { rings, sum } = useMemo(() => {
    const clean = items.filter((i) => Number.isFinite(i.value) && i.value > 0).sort((a, b) => b.value - a.value);
    const total = clean.reduce((s, i) => s + i.value, 0);
    let shown = clean;
    if (clean.length > maxRings) {
      const head = clean.slice(0, maxRings - 1);
      const rest = clean.slice(maxRings - 1);
      shown = [...head, { key: OTHER_KEY, label: 'Other', color: OTHER_COLOR, value: rest.reduce((s, i) => s + i.value, 0) }];
    }
    return { rings: shown.map((i) => ({ ...i, pct: total > 0 ? (i.value / total) * 100 : 0 })), sum: total };
  }, [items, maxRings]);

  if (rings.length === 0 || sum <= 0) return null;

  // Geometry in a fixed 200×200 viewBox; the SVG scales to `size`.
  const VB = 200;
  const outerEdge = 100;
  const innerEdge = 42; // keeps a clear hole for the centre text
  const pitch = Math.min(17, (outerEdge - innerEdge) / rings.length);
  const thickness = Math.max(4, pitch * 0.72);

  const current = activeKey !== undefined ? activeKey : hover;
  const focusKey = current ?? selectedKey ?? null;
  const shownItem = rings.find((r) => r.key === focusKey) ?? rings[0];

  const setActive = (k: string | null) => {
    setHover(k);
    onActiveChange?.(k);
  };

  return (
    <div
      className={cn('relative mx-auto max-w-full', className)}
      style={{ width: size, aspectRatio: '1 / 1' }}
      role="img"
      aria-label={`Allocation: ${rings.map((r) => `${r.label} ${r.pct.toFixed(0)}%`).join(', ')}`}
    >
      <svg viewBox={`0 0 ${VB} ${VB}`} className="h-full w-full -rotate-90" onMouseLeave={() => setActive(null)}>
        {rings.map((r, i) => {
          const radius = outerEdge - pitch * i - pitch / 2;
          const circ = 2 * Math.PI * radius;
          // Round caps add thickness/2 on each end, so shorten the dash by one thickness to keep the arc exact.
          const arc = Math.max(0.01, (Math.min(r.pct, 100) / 100) * circ - thickness);
          const dim = focusKey !== null && focusKey !== r.key;
          const clickable = !!onSelect && r.key !== OTHER_KEY;
          return (
            <g
              key={r.key}
              style={{ cursor: clickable ? 'pointer' : 'default', outline: 'none' }}
              opacity={dim ? 0.35 : 1}
              onMouseEnter={() => setActive(r.key)}
              onClick={clickable ? () => onSelect!(r.key) : undefined}
              onFocus={() => setActive(r.key)}
              onBlur={() => setActive(null)}
              tabIndex={clickable ? 0 : undefined}
              role={clickable ? 'button' : undefined}
              aria-label={`${r.label} ${r.pct.toFixed(1)}%`}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect!(r.key);
                      }
                    }
                  : undefined
              }
            >
              <title>{`${r.label} · ${r.pct.toFixed(1)}%`}</title>
              <circle cx={VB / 2} cy={VB / 2} r={radius} fill="none" strokeWidth={thickness} className={trackClassName} />
              <circle
                cx={VB / 2}
                cy={VB / 2}
                r={radius}
                fill="none"
                stroke={r.color}
                strokeWidth={thickness}
                strokeLinecap="round"
                // Start the arc half a thickness in so the round cap begins exactly at 12 o'clock.
                strokeDasharray={`${arc} ${circ}`}
                strokeDashoffset={-thickness / 2}
              />
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-[26%] text-center">
        <span className="font-numeric text-[22px] font-bold leading-none text-ink">{formatPercent(shownItem.pct)}</span>
        <span className="mt-1 max-w-full truncate text-xs text-muted">{shownItem.label}</span>
        {centerExtra && <span className="mt-0.5 text-[11px] text-muted">{centerExtra(shownItem)}</span>}
      </div>
    </div>
  );
}
