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

  useLayoutEffect(() => {
    if (!active) return;
    const measure = () => {
      const bar = document.getElementById('app-topbar')?.getBoundingClientRect();
      const strip = document.getElementById('app-marquee')?.getBoundingClientRect();
      const stripVisible = !!strip && strip.height > 0 && strip.width > 0;
      const top = Math.max(bar?.bottom ?? 56, stripVisible ? strip!.bottom : 0);
      setBox({ top, left: bar?.left ?? 0, width: bar?.width ?? window.innerWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
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
