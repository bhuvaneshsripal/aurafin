import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useDisplaySettingsStore, type EyePos } from '../store/displaySettingsStore';

const SIZE = 46; // px
const MARGIN = 8;
const HOLD_MS = 250;
/** After the hold, the finger must travel this far before the eye moves, so a steady hold never nudges it. */
const MOVE_PX = 6;
/** With a text field focused, the viewport must shrink by this much to count as the on-screen keyboard. */
const KEYBOARD_MIN_PX = 120;

/** Where the eye sits: px from the left edge and px above the bottom edge of the (keyboard-free) screen. */
type Spot = { x: number; b: number };

/** Saved spot -> Spot. Older saves were px from the top; convert them once using the current screen. */
function toSpot(saved: EyePos | null): Spot | null {
  if (!saved) return null;
  return saved.anchor === 'bottom' ? { x: saved.x, b: saved.y } : { x: saved.x, b: window.innerHeight - (saved.y + SIZE) };
}

/** True while the focused element is one that brings up the on-screen keyboard. */
function isTextEntry(el: Element | null): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image'].includes(el.type);
  }
  return el instanceof HTMLElement && el.isContentEditable;
}

/**
 * How many px the on-screen keyboard has taken off the bottom of the viewport
 * (0 when it is closed). The app asks phones to shrink the page when the
 * keyboard opens, which would drag a bottom-anchored eye up with it; knowing
 * the amount lets the eye stay exactly where it was left (under the keyboard
 * if that is where it sits) instead of hopping up above it.
 */
function useKeyboardShift(): number {
  const [shift, setShift] = useState(0);
  useEffect(() => {
    let full = window.innerHeight; // viewport height with no keyboard
    let width = window.innerWidth;
    const update = () => {
      if (window.innerWidth !== width) {
        width = window.innerWidth; // rotated / resized: start over
        full = window.innerHeight;
      }
      if (!isTextEntry(document.activeElement)) full = window.innerHeight; // nothing being typed: this is the normal height
      const drop = full - window.innerHeight;
      setShift(isTextEntry(document.activeElement) && drop > KEYBOARD_MIN_PX ? drop : 0);
    };
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return shift;
}

/**
 * Floating "show/hide amounts" eye — a second, quick-reach copy of the one in
 * the top bar. Tap to toggle. Press and hold for a moment, then drag to put it
 * anywhere on screen; it remembers where you left it and stays there — it is
 * saved as a distance from the left and bottom edges, so it sits in the same
 * place in the browser and in the installed app, and the on-screen keyboard
 * never pushes it around. It can be switched off in Settings → Preferences.
 *
 * On laptops/desktops (≥768px) it is fixed at the bottom-right: always shown,
 * not draggable, and the Settings toggle is hidden. Phones keep the above.
 */
export default function PrivacyFab() {
  const { privacyMode, togglePrivacy } = useUiStore();
  const show = useDisplaySettingsStore((s) => s.floatingEye);
  const savedPos = useDisplaySettingsStore((s) => s.eyePos);
  const setEyePos = useDisplaySettingsStore((s) => s.setEyePos);

  // Laptop/desktop breakpoint — same 768px split the rest of the app uses.
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const kb = useKeyboardShift();
  const [pos, setPos] = useState<Spot | null>(() => toSpot(savedPos));
  const [dragging, setDragging] = useState(false);
  const latestPos = useRef<Spot | null>(null);
  const [, setTick] = useState(0);
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; armed: boolean; active: boolean; timer?: number } | null>(null);

  // Follow resets from Settings. A save from an older version (px from the top)
  // is converted once to the bottom-anchored form, so it stays where it is.
  useEffect(() => {
    setPos(toSpot(savedPos));
    if (savedPos && savedPos.anchor !== 'bottom' && !isDesktop) {
      const s = toSpot(savedPos);
      if (s) setEyePos({ x: s.x, y: s.b, anchor: 'bottom' });
    }
  }, [savedPos, isDesktop, setEyePos]);

  // Keep it on screen if the window is resized / rotated.
  useEffect(() => {
    const onResize = () => setTick((n) => n + 1); // re-clamp at render; never overwrite the saved spot
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!show && !isDesktop) return null;

  // Limits are measured on the full screen height (keyboard closed), so opening
  // the keyboard can never push a saved spot to somewhere else.
  const fullH = window.innerHeight + kb;
  const clampX = (x: number) => Math.min(window.innerWidth - SIZE - MARGIN, Math.max(MARGIN, x));
  const clampB = (b: number) => Math.min(fullH - SIZE - MARGIN, Math.max(MARGIN, b));

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDesktop) return; // fixed in place on laptops: plain click only
    const r = e.currentTarget.getBoundingClientRect();
    const d = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, armed: false, active: false } as NonNullable<typeof drag.current>;
    drag.current = d;
    e.currentTarget.setPointerCapture(e.pointerId);
    d.timer = window.setTimeout(() => {
      d.armed = true;
      setDragging(true);
      navigator.vibrate?.(15);
    }, HOLD_MS);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId || !d.armed) return;
    // Holding is not moving: nothing changes until the finger really travels.
    if (!d.active) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < MOVE_PX) return;
      d.active = true;
    }
    const top = e.clientY - d.dy;
    const next = { x: clampX(e.clientX - d.dx), b: clampB(fullH - (top + SIZE)) };
    latestPos.current = next;
    setPos(next);
  };

  const finish = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    setDragging(false);
    if (d.armed) {
      // A hold (with or without movement) is never a tap.
      if (d.active && latestPos.current) setEyePos({ x: latestPos.current.x, y: latestPos.current.b, anchor: 'bottom', at: Date.now() });
      else setPos(toSpot(savedPos)); // held but never moved: back exactly where it was saved
      return;
    }
    if (!cancelled) togglePrivacy();
  };

  // Default (first time): bottom-left, just above the bottom nav on phones;
  // bottom-right on larger screens. Once moved, the saved spot wins.
  const shown = pos && !isDesktop ? { x: clampX(pos.x), b: clampB(pos.b) } : null;
  const style = shown
    ? { left: shown.x, bottom: shown.b - kb, width: SIZE, height: SIZE }
    : { left: 16, bottom: 'calc(80px + env(safe-area-inset-bottom))', width: SIZE, height: SIZE };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onClick={isDesktop ? togglePrivacy : undefined}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={privacyMode ? 'Show amounts' : 'Hide amounts'}
      title={isDesktop ? (privacyMode ? 'Show amounts' : 'Hide amounts') : privacyMode ? 'Show amounts (hold and drag to move)' : 'Hide amounts (hold and drag to move)'}
      style={{ ...style, border: '2px solid var(--color-brand-300)', color: 'var(--color-brand-600)', touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
      className={`icon-outline-green mini-fab fixed z-[45] flex items-center justify-center rounded-full shadow-md ${
        shown ? '' : 'md:!left-auto md:!right-4 md:!bottom-4'
      } ${
        dragging ? 'scale-110 shadow-xl opacity-90' : 'tap-scale'
      }`}
    >
      {privacyMode ? <EyeOff size={21} /> : <Eye size={21} />}
    </button>
  );
}
