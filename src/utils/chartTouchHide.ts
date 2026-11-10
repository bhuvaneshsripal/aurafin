/**
 * Site-wide "values show while you touch a chart, hide when you let go".
 *
 * On a computer the charts already behave this way: the tooltip follows the
 * mouse and goes away when the pointer leaves the chart. On a phone, Recharts
 * shows the tooltip while a finger moves over the chart but never hides it
 * again, so the value card stayed on screen until you tapped somewhere else.
 *
 * This one document-level listener fixes every Recharts chart in the app
 * (Net worth, Portfolio performance, Monthly change, Insights, Allocation,
 * Projection, Calculators ...) without touching each chart:
 *
 *  - Press and hold on a chart (no sideways drag yet): after a short moment the
 *    value for that spot is shown, exactly where the finger is.
 *  - Drag sideways: Recharts follows the finger and shows each value.
 *  - Lift the finger (or the browser takes the gesture to scroll): the value is
 *    hidden. A quick tap shows the value for a moment, then hides it.
 *  - Touching anywhere outside the chart also hides it.
 *
 * Mouse and pen are left alone. Recharts resets its tooltip through the
 * wrapper's React `onMouseLeave`, which React derives from the native
 * `mouseout` event, so that is the event dispatched to hide a tooltip.
 */

const WRAPPER = '.recharts-wrapper';
/** A press shorter than this, with no movement, counts as a tap. */
const TAP_MS = 300;
/** How long a tapped value stays on screen. */
const TAP_FLASH_MS = 1200;
/** Press-and-hold delay before the value appears (so a scroll never flashes it). */
const HOLD_SHOW_MS = 120;
/** Finger travel (px) beyond which the gesture is a drag, not a tap. */
const MOVE_PX = 6;

const lastTouch = (e: TouchEvent): Touch | null => e.touches[0] ?? e.changedTouches[0] ?? null;

function leave(el: Element) {
  el.dispatchEvent(
    new MouseEvent('mouseout', { bubbles: true, cancelable: true, relatedTarget: null, view: window })
  );
}

export function installChartTouchHide(): () => void {
  if (typeof document === 'undefined') return () => {};

  /** Charts that currently might be showing a value because of a touch. */
  const touched = new Set<Element>();
  let current: Element | null = null;
  let startX = 0;
  let startY = 0;
  let startAt = 0;
  let moved = false;
  let holdTimer = 0;
  let hideTimer = 0;
  let latest: { x: number; y: number } = { x: 0, y: 0 };

  const hideAll = () => {
    window.clearTimeout(hideTimer);
    hideTimer = 0;
    touched.forEach(leave);
    touched.clear();
  };

  const onStart = (e: TouchEvent) => {
    window.clearTimeout(holdTimer);
    window.clearTimeout(hideTimer);
    const t = lastTouch(e);
    const wrapper = (e.target as Element | null)?.closest?.(WRAPPER) ?? null;
    // A new touch anywhere else (or on another chart) closes whatever is showing.
    touched.forEach((el) => {
      if (el !== wrapper) leave(el);
    });
    touched.clear();
    current = wrapper;
    if (!wrapper || !t) return;
    touched.add(wrapper);
    startX = latest.x = t.clientX;
    startY = latest.y = t.clientY;
    startAt = Date.now();
    moved = false;
    // Press and hold: show the value under the finger without needing to move.
    holdTimer = window.setTimeout(() => {
      if (current !== wrapper || moved) return;
      wrapper.dispatchEvent(
        new MouseEvent('mousemove', { bubbles: true, cancelable: true, clientX: latest.x, clientY: latest.y, view: window })
      );
    }, HOLD_SHOW_MS);
  };

  const onMove = (e: TouchEvent) => {
    if (!current) return;
    const t = lastTouch(e);
    if (!t) return;
    latest = { x: t.clientX, y: t.clientY };
    if (Math.abs(t.clientX - startX) > MOVE_PX || Math.abs(t.clientY - startY) > MOVE_PX) {
      moved = true;
      window.clearTimeout(holdTimer);
    }
  };

  const onEnd = (e: TouchEvent) => {
    window.clearTimeout(holdTimer);
    const wrapper = current;
    current = null;
    if (!wrapper) return;
    // Another finger is still down: keep going until the last one lifts.
    if (e.type === 'touchend' && e.touches.length > 0) {
      current = wrapper;
      return;
    }
    window.clearTimeout(hideTimer);
    const quickTap = e.type === 'touchend' && !moved && Date.now() - startAt < TAP_MS;
    if (quickTap) {
      // The browser is about to send its own mouse events for the tap, which is
      // what shows the value; leave it up for a moment, then hide it.
      hideTimer = window.setTimeout(hideAll, TAP_FLASH_MS);
      return;
    }
    // Finger lifted after a hold or a drag (or the browser took over to scroll).
    // Stop the browser from replaying the press as mouse events, which would
    // bring the value straight back.
    if (e.cancelable) e.preventDefault();
    hideAll();
    // Some browsers still replay a mouse move after the lift; hide once more.
    hideTimer = window.setTimeout(hideAll, 350);
    touched.add(wrapper);
  };

  const passive = { passive: true, capture: true } as const;
  // touchend must be able to cancel the browser's follow-up mouse events.
  const active = { passive: false, capture: true } as const;
  document.addEventListener('touchstart', onStart, passive);
  document.addEventListener('touchmove', onMove, passive);
  document.addEventListener('touchend', onEnd, active);
  document.addEventListener('touchcancel', onEnd, passive);
  return () => {
    window.clearTimeout(holdTimer);
    window.clearTimeout(hideTimer);
    document.removeEventListener('touchstart', onStart, passive);
    document.removeEventListener('touchmove', onMove, passive);
    document.removeEventListener('touchend', onEnd, active);
    document.removeEventListener('touchcancel', onEnd, passive);
  };
}
