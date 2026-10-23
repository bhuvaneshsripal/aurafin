import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useDisplaySettingsStore } from '../store/displaySettingsStore';

const SIZE = 40; // px
const MARGIN = 8;
const HOLD_MS = 250;

/**
 * Floating "show/hide amounts" eye — a second, quick-reach copy of the one in
 * the top bar. Tap to toggle. Press and hold for a moment, then drag to put it
 * anywhere on screen; it remembers where you left it. It can be switched off
 * in Settings → Preferences.
 */
export default function PrivacyFab() {
  const { privacyMode, togglePrivacy } = useUiStore();
  const show = useDisplaySettingsStore((s) => s.floatingEye);
  const savedPos = useDisplaySettingsStore((s) => s.eyePos);
  const setEyePos = useDisplaySettingsStore((s) => s.setEyePos);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(savedPos);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; dx: number; dy: number; armed: boolean; active: boolean; timer?: number } | null>(null);

  // Follow resets from Settings.
  useEffect(() => setPos(savedPos), [savedPos]);

  const clampPos = (x: number, y: number) => ({
    x: Math.min(window.innerWidth - SIZE - MARGIN, Math.max(MARGIN, x)),
    y: Math.min(window.innerHeight - SIZE - MARGIN, Math.max(MARGIN, y)),
  });

  // Keep it on screen if the window is resized / rotated.
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampPos(p.x, p.y) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  if (!show) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
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
    setPos(clampPos(e.clientX - d.dx, e.clientY - d.dy));
  };

  const finish = (e: React.PointerEvent<HTMLButtonElement>, cancelled: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    window.clearTimeout(d.timer);
    drag.current = null;
    setDragging(false);
    if (d.armed) {
      // A hold (with or without movement) is never a tap.
      if (d.active) setPos((p) => { if (p) setEyePos(p); return p; });
      return;
    }
    if (!cancelled) togglePrivacy();
  };

  // Default: bottom-right, clear of the bottom nav on phones.
  const style = pos
    ? { left: pos.x, top: pos.y, width: SIZE, height: SIZE }
    : { right: 16, bottom: 'calc(72px + env(safe-area-inset-bottom))', width: SIZE, height: SIZE };

  return (
    <button
      type="button"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => finish(e, false)}
      onPointerCancel={(e) => finish(e, true)}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={privacyMode ? 'Show amounts' : 'Hide amounts'}
      title={privacyMode ? 'Show amounts (hold and drag to move)' : 'Hide amounts (hold and drag to move)'}
      style={{ ...style, touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' }}
      className={`icon-outline-green mini-fab fixed z-30 flex items-center justify-center rounded-full shadow-md md:!bottom-4 ${
        dragging ? 'scale-110 shadow-xl opacity-90' : 'tap-scale'
      }`}
    >
      {privacyMode ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}
