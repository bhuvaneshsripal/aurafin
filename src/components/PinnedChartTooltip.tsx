import type { ReactNode, RefObject } from 'react';

/** Gap kept between the pinned point's x and the tooltip's nearest edge. */
const GAP = 14;

/**
 * Shows a pinned chart tooltip along the top of its chart, *beside* the tapped
 * point (never over it) so the highlighted dot/line stays visible — important
 * for peaks, which sit right at the top of the plot where a centred tooltip
 * (or a finger) would hide them. The tooltip opens toward whichever side of
 * the chart has more room. Tapping it closes it.
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

  // No known x: fall back to centred.
  if (x === undefined || width <= 0) {
    return (
      <div
        data-pinned-tip
        onClick={onHide}
        className="absolute top-0 z-10 cursor-pointer"
        style={{ left: width / 2, transform: 'translateX(-50%)' }}
      >
        {children}
      </div>
    );
  }

  // Open to the left when the point is in the right half, otherwise to the right.
  const openLeft = x > width / 2;

  return (
    <div
      data-pinned-tip
      onClick={onHide}
      className="absolute top-0 z-10 cursor-pointer"
      style={
        openLeft
          ? { left: x - GAP, transform: 'translateX(-100%)' }
          : { left: x + GAP }
      }
    >
      {children}
    </div>
  );
}
