import { useCallback, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** Swipe-to-dismiss for a floating notice. It follows the finger left, right
 *  or toward `edge` (a notice that lives at the top flies off `'up'`, one at
 *  the bottom flies off `'down'`), fades as it goes, springs back if the swipe
 *  was too short, and flies off-screen smoothly when it was far or fast
 *  enough, then calls `onDismiss`. A plain tap never counts as a swipe, so
 *  the notice's own buttons keep working. */
export function useSwipeDismiss(onDismiss: () => void, edge: 'up' | 'down') {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flung, setFlung] = useState(false);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);
  const sign = edge === 'up' ? -1 : 1;

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (flung) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    moved.current = false;
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const s0 = start.current;
    if (!s0 || s0.id !== e.pointerId) return;
    const dx = e.clientX - s0.x;
    const dy = Math.max(0, (e.clientY - s0.y) * sign); // only toward the edge
    if (!moved.current) {
      if (Math.abs(dx) < 6 && dy < 6) return;
      moved.current = true;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setDrag({ x: dx, y: dy * sign });
  };

  const end = (e: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const s0 = start.current;
    start.current = null;
    if (!s0 || !moved.current) return;
    setDragging(false);
    const dx = e.clientX - s0.x;
    const dy = Math.max(0, (e.clientY - s0.y) * sign);
    const dt = Math.max(1, Date.now() - s0.t);
    const dist = Math.max(Math.abs(dx), dy);
    const horizontal = Math.abs(dx) >= dy;
    const far = horizontal ? Math.abs(dx) > 90 : dy > 50;
    const fast = dist / dt > 0.5; // px per ms
    if (!cancelled && (far || (fast && dist > 30))) {
      setFlung(true);
      setDrag(horizontal ? { x: dx < 0 ? -window.innerWidth : window.innerWidth, y: 0 } : { x: dx, y: sign * 240 });
      window.setTimeout(onDismiss, 220);
    } else {
      setDrag({ x: 0, y: 0 }); // spring back
    }
  };

  const reset = useCallback(() => {
    setDrag({ x: 0, y: 0 });
    setFlung(false);
    setDragging(false);
  }, []);

  const offset = Math.max(Math.abs(drag.x) / 300, Math.abs(drag.y) / 160);
  const style: CSSProperties = {
    touchAction: 'none',
    transform: drag.x || drag.y ? `translate3d(${drag.x}px, ${drag.y}px, 0)` : undefined,
    opacity: flung ? 0 : drag.x || drag.y ? Math.max(0.35, 1 - offset) : undefined,
    transition: dragging ? 'none' : 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out',
    willChange: dragging ? 'transform, opacity' : undefined,
  };

  return {
    /** Spread onto the swipeable element. */
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp: (e: ReactPointerEvent<HTMLElement>) => end(e),
      onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => end(e, true),
    },
    style,
    flung,
    /** True right after a drag, so a click that follows it can be ignored. */
    wasDragged: () => moved.current,
    reset,
  };
}
