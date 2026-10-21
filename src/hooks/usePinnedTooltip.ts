import { useEffect, useRef, useState } from 'react';

/**
 * Tap-to-pin tooltips for charts on touch screens (and mouse clicks on desktop).
 *
 * Recharts' own tooltip only shows while a finger or cursor is over the chart,
 * so on a phone it can't be kept open, and a tap elsewhere doesn't close it.
 * This hook keeps the pinned point in React state instead:
 *   - tapping a point or bar pins its tooltip;
 *   - tapping the same point again unpins it;
 *   - tapping empty space in the chart, or anywhere outside it, unpins it.
 * The chart keeps its own hover tooltip, but only on devices with a real
 * hover (see `isTouchDevice`), and never while something is pinned.
 */

export interface PinnedPoint {
  label: string;
  /** Pixel x of the tapped point inside the chart, when recharts reports it. */
  x?: number;
}

/** The subset of recharts' click state this hook reads. */
export interface ChartClickState {
  activeLabel?: unknown;
  activeCoordinate?: { x: number; y: number };
}

/** True on devices whose primary pointer can't hover (phones, most tablets). */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(hover: none)').matches;

export function usePinnedTooltip() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState<PinnedPoint | null>(null);
  const isPinned = pinned !== null;

  // While something is pinned, a tap anywhere outside the chart unpins it.
  // Taps inside the chart are handled by the chart's own click handler, so
  // they're ignored here.
  useEffect(() => {
    if (!isPinned) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setPinned(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [isPinned]);

  const handleChartClick = (state: ChartClickState | null | undefined) => {
    const label = state?.activeLabel;
    if (label === undefined || label === null || label === '') {
      // Tapped empty space in the chart.
      setPinned(null);
      return;
    }
    const key = String(label);
    setPinned((prev) =>
      prev?.label === key ? null : { label: key, x: state?.activeCoordinate?.x }
    );
  };

  return {
    containerRef,
    pinned,
    handleChartClick,
    hidePinned: () => setPinned(null),
  };
}
