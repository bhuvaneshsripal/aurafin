import { useCallback, useEffect, useRef } from 'react';

/** Drag-down-to-close for a bottom sheet (phones).
 *  - The sheet follows the finger downward and the dimmed backdrop fades.
 *  - Release past ~25% of its height, or with a quick flick, and it slides
 *    off screen, then calls `onClose`. Otherwise it springs back.
 *  - If the sheet's content is scrolled, the gesture scrolls it as usual;
 *    dragging only starts once the content is at the top.
 *  - Taps are untouched, so buttons inside keep working.
 *
 *  Usage: `const sheetRef = useSheetSwipeClose(close);` then put
 *  `ref={sheetRef}` on the sheet panel (its direct parent is the backdrop). */
const CLOSE_FRACTION = 0.25;
const FLICK_SPEED = 0.6; // px per ms
const FLY_MS = 200;

export function useSheetSwipeClose(onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  // Callback ref: the sheets are mounted only while open, so listeners are
  // attached each time the panel appears and removed when it goes away.
  return useCallback((el: HTMLElement | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;
    const backdrop = el.parentElement;

    let startY = 0;
    let dy = 0;
    let tracking = false;
    let dragging = false;
    let lastY = 0;
    let lastT = 0;
    let velocity = 0;
    let closing = false;

    const onStart = (e: TouchEvent) => {
      if (closing || e.touches.length !== 1) return;
      startY = lastY = e.touches[0].clientY;
      lastT = performance.now();
      dy = 0;
      velocity = 0;
      tracking = true;
      dragging = false;
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking) return;
      const y = e.touches[0].clientY;
      const d = y - startY;
      if (!dragging) {
        if (d < -4 || el.scrollTop > 0) { tracking = false; return; } // scrolling content
        if (d < 6) return;
        dragging = true;
        el.style.transition = 'none';
      }
      if (e.cancelable) e.preventDefault(); // stop the page/sheet scrolling while dragging
      dy = Math.max(0, d);
      el.style.transform = `translate3d(0, ${dy}px, 0)`;
      if (backdrop) backdrop.style.opacity = String(Math.max(0.2, 1 - dy / (el.offsetHeight || 400)));
      const now = performance.now();
      velocity = (y - lastY) / Math.max(1, now - lastT);
      lastY = y;
      lastT = now;
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const h = el.offsetHeight || 400;
      if (dy > h * CLOSE_FRACTION || velocity > FLICK_SPEED) {
        closing = true;
        el.style.transition = `transform ${FLY_MS}ms ease-in`;
        el.style.transform = `translate3d(0, ${h}px, 0)`;
        if (backdrop) {
          backdrop.style.transition = `opacity ${FLY_MS}ms ease-in`;
          backdrop.style.opacity = '0';
        }
        window.setTimeout(() => closeRef.current(), FLY_MS);
      } else {
        el.style.transition = 'transform 250ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        el.style.transform = '';
        if (backdrop) {
          backdrop.style.transition = 'opacity 250ms ease-out';
          backdrop.style.opacity = '';
        }
      }
    };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    cleanup.current = () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, []);
}
