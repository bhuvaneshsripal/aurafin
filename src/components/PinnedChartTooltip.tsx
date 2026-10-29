import type { ReactNode, RefObject } from 'react';

/**
 * Shows a pinned chart tooltip along the top of its chart, centred on the
 * tapped point and kept inside the chart's edges. Tapping it closes it.
 * Used with `usePinnedTooltip`, which owns the pinned state.
 */
export default function PinnedChartTooltip({
  containerRef,
  x,
  onHide,
  children,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  x?: number;
  onHide: () => void;
  children: ReactNode;
}) {
  const width = containerRef.current?.clientWidth ?? 0;
  const half = 96; // roughly half the tooltip's width, so it doesn't spill past the chart edge
  const left =
    x !== undefined && width > 0 ? Math.min(Math.max(x, half + 4), width - half - 4) : width / 2;

  return (
    <div
      data-pinned-tip
      onClick={onHide}
      className="absolute top-0 z-10 cursor-pointer"
      style={{ left, transform: 'translateX(-50%)' }}
    >
      {children}
    </div>
  );
}
