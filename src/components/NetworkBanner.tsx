import { useEffect, useRef, useState } from 'react';
import { WifiLow, X } from 'lucide-react';
import { useNetworkQuality, type NetworkQuality } from '../hooks/useNetworkQuality';
import { useExitPresence } from '../hooks/useExitPresence';

const COPY: Record<Exclude<NetworkQuality, 'good'>, { title: string; body: string }> = {
  low: { title: 'Low network connection', body: 'Some features may work slowly or not at all.' },
  offline: { title: 'No network connection', body: "You're offline. Some features may not work." },
};

/** Bottom notice for a weak or missing connection, with a dismiss button
 *  and swipe-to-dismiss (left, right or down).
 *  Dismissing hides it until the connection state changes again (e.g. it
 *  drops from low to offline, or recovers and later degrades). */
// Slow, gentle motion for dismissing / snapping back.
const SLOW_MS = 450;
const SLOW_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export default function NetworkBanner() {
  const quality = useNetworkQuality();
  const [dismissedFor, setDismissedFor] = useState<NetworkQuality | null>(null);

  // A recovery re-arms the banner for the next drop.
  useEffect(() => {
    if (quality === 'good') setDismissedFor(null);
  }, [quality]);

  const show = quality !== 'good' && dismissedFor !== quality;
  // Keep the last message around while the exit animation plays.
  const [last, setLast] = useState<Exclude<NetworkQuality, 'good'>>('low');
  useEffect(() => {
    if (quality !== 'good') setLast(quality);
  }, [quality]);
  const { mounted, closing } = useExitPresence(show, SLOW_MS);

  // --- Swipe to dismiss (left, right or down) ---------------------------
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [flung, setFlung] = useState(false);
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const moved = useRef(false);

  // Re-arm the gesture state whenever the banner shows again.
  useEffect(() => {
    if (show) {
      setDrag({ x: 0, y: 0 });
      setFlung(false);
      setDragging(false);
    }
  }, [show]);

  if (!mounted) return null;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (flung) return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    moved.current = false;
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s0 = start.current;
    if (!s0 || s0.id !== e.pointerId) return;
    const dx = e.clientX - s0.x;
    const dy = Math.max(0, e.clientY - s0.y); // never drag upward
    if (!moved.current) {
      if (Math.abs(dx) < 6 && dy < 6) return;
      moved.current = true;
      setDragging(true);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    setDrag({ x: dx, y: dy });
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const s0 = start.current;
    start.current = null;
    if (!s0 || !moved.current) return;
    setDragging(false);
    const dx = e.clientX - s0.x;
    const dy = Math.max(0, e.clientY - s0.y);
    const dt = Math.max(1, Date.now() - s0.t);
    const fast = Math.max(Math.abs(dx), dy) / dt > 0.5; // px per ms
    const horizontal = Math.abs(dx) >= dy;
    const far = horizontal ? Math.abs(dx) > 90 : dy > 50;
    if (!cancelled && (far || (fast && Math.max(Math.abs(dx), dy) > 30))) {
      const W = window.innerWidth;
      setFlung(true);
      setDrag(horizontal ? { x: dx < 0 ? -W : W, y: 0 } : { x: dx, y: 240 });
      window.setTimeout(() => setDismissedFor(quality), SLOW_MS);
    } else {
      setDrag({ x: 0, y: 0 });
    }
  };

  const kind = quality !== 'good' ? quality : last;
  const { title, body } = COPY[kind];

  return (
    <div
      className="fixed left-0 right-0 z-[70] flex justify-center px-4 pointer-events-none bottom-[calc(56px_+_env(safe-area-inset-bottom)_+_12px)] md:bottom-4"
    >
      <div
        role="status"
        aria-live="polite"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e)}
        onPointerCancel={(e) => endDrag(e, true)}
        style={{
          touchAction: 'none',
          transform: drag.x || drag.y ? `translate(${drag.x}px, ${drag.y}px)` : undefined,
          opacity: flung ? 0 : drag.x || drag.y ? Math.max(0.35, 1 - Math.max(Math.abs(drag.x) / 300, drag.y / 160)) : undefined,
          transition: dragging ? 'none' : `transform ${SLOW_MS}ms ${SLOW_EASE}, opacity ${SLOW_MS}ms ease`,
          animationDuration: closing && !flung ? `${SLOW_MS}ms` : undefined,
          animationTimingFunction: closing && !flung ? 'ease-in-out' : undefined,
        }}
        className={`${flung ? '' : closing ? 'animate-menu-out' : 'animate-dialog-in'} select-none pointer-events-auto w-full max-w-md flex items-center gap-3.5 rounded-2xl px-4 py-3 bg-[#1b1d23] text-white border border-white/5 shadow-lg`}
      >
        {/* Wi-Fi glyph with a small red "x" badge */}
        <span className="relative shrink-0 inline-flex h-7 w-7 items-center justify-center" aria-hidden>
          <WifiLow size={26} strokeWidth={2} className="text-white" />
          <X size={11} strokeWidth={3.5} className="absolute -bottom-0.5 -right-0.5 text-red-500" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{body}</p>
        </div>
        <button
          type="button"
          onClick={() => setDismissedFor(quality)}
          aria-label="Dismiss"
          className="tap-scale shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
}
