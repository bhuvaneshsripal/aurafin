import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';

/** Swipe-to-dismiss for a floating notice, behaving like a phone notification.
 *  - It follows the finger left, right or toward `edge` (a notice at the top
 *    flies off `'up'`, one at the bottom flies off `'down'`) and fades a
 *    little at a time as it goes.
 *  - Let go after only a small move and it eases back and fades back in.
 *  - Let go after a long drag (or a real flick) and it keeps sliding away
 *    while fading out slowly, then calls `onDismiss`.
 *  A plain tap never counts as a swipe, so the notice's own buttons keep working. */
/** How long the slide-away + fade-out takes (ms). Slow and gentle on purpose. */
const FLY_MS = 550;
/** How long the ease-back takes (ms). */
const RETURN_MS = 350;
/** Must be dragged this far (fraction of the notice's width) to be dismissed. */
const DISMISS_FRACTION = 0.4;
/** Down/up swipes: dragged at least this many px (or the notice's own height). */
const MIN_VERTICAL_PX = 70;
/** A quick flick counts too, but only a real one (px per ms) over a real distance. */
const FLICK_SPEED = 0.9;
const FLICK_MIN_PX = 60;

type Sample = { x: number; y: number; t: number };

export function useSwipeDismiss(onDismiss: () => void, edge: 'up' | 'down') {
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flung, setFlung] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; w: number; h: number } | null>(null);
  const samples = useRef<Sample[]>([]);
  const last = useRef({ x: 0, y: 0 });
  const moved = useRef(false);
  const timer = useRef(0);
  const sign = edge === 'up' ? -1 : 1;

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (flung) return;
    const r = e.currentTarget.getBoundingClientRect();
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, w: r.width || 300, h: r.height || 60 };
    samples.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
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
    const now = performance.now();
    samples.current.push({ x: e.clientX, y: e.clientY, t: now });
    samples.current = samples.current.filter((p) => now - p.t < 150);
    last.current = { x: dx, y: dy * sign };
    setDrag(last.current);
  };

  const end = (e: ReactPointerEvent<HTMLElement>, cancelled = false) => {
    const s0 = start.current;
    start.current = null;
    if (!s0 || !moved.current) return;
    setDragging(false);

    const dx = last.current.x;
    const dy = Math.abs(last.current.y);
    const horizontal = Math.abs(dx) >= dy;
    const dist = horizontal ? Math.abs(dx) : dy;

    // Speed over the last ~150ms only, so a slow drag that ends with a tiny
    // twitch never counts as a flick.
    const now = performance.now();
    const recent = samples.current.filter((p) => now - p.t < 150);
    let speed = 0;
    if (recent.length >= 2) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const d = horizontal ? Math.abs(b.x - a.x) : Math.max(0, (b.y - a.y) * sign);
      speed = d / Math.max(1, b.t - a.t);
    }

    const far = horizontal ? dist > s0.w * DISMISS_FRACTION : dist > Math.max(MIN_VERTICAL_PX, s0.h);
    const flick = speed > FLICK_SPEED && dist > FLICK_MIN_PX;

    if (!cancelled && (far || flick)) {
      setFlung(true);
      setDrag(
        horizontal
          ? { x: dx < 0 ? -window.innerWidth : window.innerWidth, y: 0 }
          : { x: dx, y: sign * (s0.h + 120) }
      );
      timer.current = window.setTimeout(onDismiss, FLY_MS);
    } else {
      setDrag({ x: 0, y: 0 }); // small move: ease back, like a phone notification
    }
    void e;
  };

  const reset = useCallback(() => {
    window.clearTimeout(timer.current);
    last.current = { x: 0, y: 0 };
    setDrag({ x: 0, y: 0 });
    setFlung(false);
    setDragging(false);
  }, []);

  // Fades gradually with distance (never fully gone until it is dismissed).
  const w = start.current?.w ?? 320;
  const fade = Math.max(0.1, 1 - Math.max(Math.abs(drag.x) / (w * 0.9), Math.abs(drag.y) / 140));
  const style: CSSProperties = {
    touchAction: 'none',
    transform: drag.x || drag.y ? `translate3d(${drag.x}px, ${drag.y}px, 0)` : undefined,
    opacity: flung ? 0 : drag.x || drag.y ? fade : undefined,
    transition: dragging
      ? 'none'
      : flung
        ? `transform ${FLY_MS}ms cubic-bezier(0.3, 0, 0.5, 1), opacity ${FLY_MS}ms ease-in-out`
        : `transform ${RETURN_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity ${RETURN_MS}ms ease-out`,
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
