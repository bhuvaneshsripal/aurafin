import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export type PillTone = 'brand' | 'red' | 'amber' | 'neutral';
const DOT: Record<PillTone, string> = {
  brand: 'bg-brand-600 dark:bg-brand-400',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  neutral: 'bg-slate-400',
};

export interface HeaderPill {
  /** Bold part, e.g. "40" or "₹1,59,960". */
  value: ReactNode;
  /** Plain part after it, e.g. "assets". */
  label?: ReactNode;
  /** Phones: a shorter label (e.g. "value" for "current value") so the chips fit on one row. */
  shortLabel?: ReactNode;
  /** Plain part before the value, e.g. "Tracking since". */
  prefix?: ReactNode;
  tone?: PillTone;
  /** Hides the coloured dot (it is hidden on phones anyway). */
  noDot?: boolean;
  /** Colours the bold value green / red (for gains and losses). */
  valueTone?: 'positive' | 'negative';
}

// Phones: the chips always stay on ONE line and are sized to span it edge to edge.
// Text is measured at REF px, then scaled (padding and gaps are in em, so the whole row scales
// together) to the width available, never smaller than MIN or larger than MAX px.
const REF = 12;
const MIN = 10;
const MAX = 13;
const DESKTOP = '(min-width: 640px)';

/** The small rounded summary chips shown under a page title. `singleLine` is kept for old call sites:
 *  every row is now single-line and fitted on phones, and wraps normally from 640px up. */
export default function HeaderPills({ pills }: { pills: HeaderPill[]; singleLine?: boolean }) {
  const boxRef = useRef<HTMLSpanElement>(null);
  const [fit, setFit] = useState<{ size: number; fill: boolean } | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const apply = (next: { size: number; fill: boolean } | null) =>
      setFit((cur) =>
        cur === next || (cur && next && Math.abs(cur.size - next.size) < 0.05 && cur.fill === next.fill) ? cur : next
      );
    const measure = () => {
      if (window.matchMedia(DESKTOP).matches) return apply(null);
      const prev = box.style.fontSize;
      box.style.fontSize = `${REF}px`;
      const kids = Array.from(box.children) as HTMLElement[];
      const gap = parseFloat(getComputedStyle(box).columnGap) || 0;
      const natural = kids.reduce((sum, k) => sum + k.getBoundingClientRect().width, 0) + gap * Math.max(0, kids.length - 1);
      box.style.fontSize = prev;
      const available = box.clientWidth;
      if (!natural || !available) return;
      const raw = ((REF * available) / natural) * 0.97; // small margin for the 1px borders
      apply({ size: Math.max(MIN, Math.min(MAX, raw)), fill: raw < MAX });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    // Re-fit once the web font has loaded (the fallback font has different widths).
    void document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  });

  return (
    <span
      ref={boxRef}
      style={fit ? { fontSize: fit.size } : undefined}
      className={`mt-1.5 flex w-full flex-nowrap items-center gap-[0.4em] overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:gap-2 sm:overflow-visible ${
        fit?.fill ? 'justify-between' : ''
      } sm:justify-start`}
    >
      {pills.map((p, i) => (
        <span
          key={i}
          className="inline-flex shrink-0 items-center gap-[0.3em] whitespace-nowrap rounded-full border border-line bg-surface px-[0.65em] py-[0.3em] text-muted sm:gap-1.5 sm:px-2.5 sm:py-1 sm:text-xs"
        >
          {!p.noDot && <span className={`hidden h-1.5 w-1.5 rounded-full sm:block ${DOT[p.tone ?? 'brand']}`} />}
          {p.prefix != null && <>{p.prefix} </>}
          <b
            className={`font-semibold ${
              p.valueTone === 'positive' ? 'text-positive' : p.valueTone === 'negative' ? 'text-negative' : 'text-ink'
            }`}
          >
            {p.value}
          </b>
          {p.label != null &&
            (p.shortLabel != null ? (
              <>
                <span className="hidden sm:inline"> {p.label}</span>
                <span className="sm:hidden">{p.shortLabel}</span>
              </>
            ) : (
              <> {p.label}</>
            ))}
        </span>
      ))}
    </span>
  );
}
