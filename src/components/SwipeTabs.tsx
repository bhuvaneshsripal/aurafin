import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

/** Bottom-nav tabs in order; swiping sideways on one of them moves to its neighbour. */
const TABS = ['/', '/wealth', '/transactions'];

const MIN_DX = 70; // px of horizontal travel
const MAX_MS = 700; // slower drags are scrolling/reading, not a swipe
const DOMINANCE = 1.6; // horizontal travel must clearly beat vertical

/** True if the touch began somewhere a sideways drag already means something else. */
function startsInSwipeBlocker(el: EventTarget | null): boolean {
  let node = el instanceof Element ? el : null;
  if (!node) return true;
  if (node.closest('input, textarea, select, [contenteditable="true"], [data-no-swipe], .fixed, [role="slider"]')) return true;
  // Horizontally scrollable areas (wide tables, chip rows, tab strips, charts).
  while (node && node !== document.body) {
    if (node.scrollWidth > node.clientWidth + 1) {
      const ox = getComputedStyle(node).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    node = node.parentElement;
  }
  return false;
}

/** Mobile only: swipe left/right to flip between Overview, Wealth and Money. Renders nothing. */
export default function SwipeTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const idx = TABS.indexOf(pathname);
    if (idx === -1) return; // sub-pages and non-tab pages keep their own gestures

    const mq = window.matchMedia('(max-width: 767px)');
    let start: { x: number; y: number; t: number } | null = null;

    const onStart = (e: TouchEvent) => {
      if (!mq.matches || e.touches.length !== 1 || startsInSwipeBlocker(e.target)) {
        start = null;
        return;
      }
      const t = e.touches[0];
      start = { x: t.clientX, y: t.clientY, t: Date.now() };
    };

    const onEnd = (e: TouchEvent) => {
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      const dt = Date.now() - start.t;
      start = null;
      if (Math.abs(dx) < MIN_DX || Math.abs(dx) < Math.abs(dy) * DOMINANCE || dt > MAX_MS) return;
      if (window.getSelection()?.toString()) return; // user was selecting text

      const next = dx < 0 ? idx + 1 : idx - 1; // swipe left → next tab
      if (next < 0 || next >= TABS.length) return;
      const root = document.documentElement;
      root.dataset.swipe = dx < 0 ? 'next' : 'prev';
      window.setTimeout(() => delete root.dataset.swipe, 400);
      navigate(TABS[next]);
    };

    const onCancel = () => {
      start = null;
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchend', onEnd, { passive: true });
    document.addEventListener('touchcancel', onCancel, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onCancel);
    };
  }, [navigate, pathname]);

  return null;
}
