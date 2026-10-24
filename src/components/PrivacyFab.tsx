import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useDisplaySettingsStore } from '../store/displaySettingsStore';

const SIZE = 46; // px
const MARGIN = 8;
const HOLD_MS = 250;

/**
 * Floating "show/hide amounts" eye — a second, quick-reach copy of the one in
 * the top bar. Tap to toggle. Press and hold for a moment, then drag to put it
 * anywhere on screen; it remembers where you left it. It can be switched off
 * in Settings → Preferences.
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

  const [pos, setPos] = useState<{ x: number; y: number } | null>(savedPos);
  const [dragging, setDragging] = useState(false);
  const latestPos = useRef<{ x: number; y: number } | null>(null);
  const [, setTick] = useState(0);
  const drag = useRef<{ id: number; dx: number; dy: number; armed: boolean; active: boolean; timer?: number } | null>(null);

  // Follow resets from Settings (and pull a saved spot back on screen).
  useEffect(() => setPos(savedPos ? clampPos(savedPos.x, savedPos.y) : null), [savedPos]);

  function clampPos(x: number, y: number) {
    return {
      x: Math.min(window.innerWidth - SIZE - MARGIN, Math.max(MARGIN, x)),
      y: Math.min(window.innerHeight - SIZE - MARGIN, Math.max(MARGIN, y)),
    };
  }

  // Keep it on screen if the window is resized / rotated.
  useEffect(() => {
    const onResize = () => setTick((n) => n + 1); // re-clamp at render; never overwrite the saved spot
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!show && !isDesktop) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (isDesktop) return; // fixed in place on laptops: plain click only
    const r = e.currentTarget.getBoundingClientRect();
    const d = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top, armed: false, active: false } as NonNullable<typeof drag.current>;
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
    d.active = true;
    const next = clampPos(e.clientX - d.dx, e.clientY - d.dy);
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
      if (d.active && latestPos.current) setEyePos(latestPos.current);
      return;
    }
    if (!cancelled) togglePrivacy();
  };

  // Default (first time): bottom-left, just above the bottom nav on phones;
  // bottom-right on larger screens. Once moved, the saved spot wins.
  const shown = pos && !isDesktop ? clampPos(pos.x, pos.y) : null;
  const style = shown
    ? { left: shown.x, top: shown.y, width: SIZE, height: SIZE }
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
