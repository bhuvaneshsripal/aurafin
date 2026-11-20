import { useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRefreshBarStore } from '../store/refreshBarStore';

/**
 * A thin green line that slides along the bottom edge of the top bar (on
 * phones: under the market index strip) while the app refreshes after you tap
 * the page you're already on. Portaled to <body> and placed from the bars'
 * measured position so it lines up exactly, whatever zoom the page uses.
 */
export default function RefreshBar() {
  const active = useRefreshBarStore((s) => s.active);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);

  // Keep the line glued to the bottom of the bars for as long as it shows. The position is
  // re-read every frame (cheap, and only while active) because the "new update" notice, the
  // network banner or a scroll can move the bars *after* the line starts.
  useLayoutEffect(() => {
    if (!active) {
      setBox(null);
      return;
    }
    let raf = 0;
    const measure = () => {
      const bar = document.getElementById('app-topbar')?.getBoundingClientRect();
      const strip = document.getElementById('app-marquee')?.getBoundingClientRect();
      const stripVisible = !!strip && strip.height > 0 && strip.width > 0;
      // Always the bottom edge of the top bar / index strip, never the "new update"
      // notice above them (the bars sit below the notice, so they already move with it).
      const top = Math.max(bar?.bottom ?? 56, stripVisible ? strip!.bottom : 0);
      const left = bar?.left ?? 0;
      const width = bar?.width ?? window.innerWidth;
      setBox((prev) =>
        prev && prev.top === top && prev.left === left && prev.width === width ? prev : { top, left, width }
      );
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active || !box) return null;
  return createPortal(
    <div
      role="progressbar"
      aria-label="Refreshing"
      aria-busy="true"
      className="fixed z-[90] h-[3px] overflow-hidden bg-[#0a9a4b]/15 pointer-events-none"
      style={{ top: box.top, left: box.left, width: box.width }}
    >
      <div className="refresh-bar-run h-full w-2/5 rounded-full bg-[#0a9a4b]" />
    </div>,
    document.body
  );
}
