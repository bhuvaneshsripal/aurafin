import { useEffect, useState } from 'react';
import { useToastStore, type Toast, type ToastTone } from '../store/toastStore';
import { useNetworkStore } from '../store/networkStore';
import { useSwipeDismiss } from '../hooks/useSwipeDismiss';

const TONE_CLASSES: Record<ToastTone, string> = {
  error: 'bg-red-600',
  success: 'bg-emerald-700',
  info: 'bg-[#171717] dark:bg-[#232321] dark:border dark:border-white/10',
};

const RING_R = 13;
const RING_C = 2 * Math.PI * RING_R;

/** Circle that drains over `ms`, with the whole seconds left in the middle (4 → 3 → 2 → 1). */
function CountdownRing({ ms }: { ms: number }) {
  const [left, setLeft] = useState(Math.ceil(ms / 1000));
  useEffect(() => {
    const start = Date.now();
    const t = window.setInterval(() => setLeft(Math.max(1, Math.ceil((ms - (Date.now() - start)) / 1000))), 200);
    return () => window.clearInterval(t);
  }, [ms]);
  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center text-[13px] font-semibold tabular-nums" aria-hidden>
      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90">
        <circle cx="16" cy="16" r={RING_R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.5" />
        <circle
          cx="16"
          cy="16"
          r={RING_R}
          fill="none"
          stroke="#7fd9a8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={RING_C}
          style={{ animation: `toast-ring ${ms}ms linear forwards` }}
        />
      </svg>
      {left}
    </span>
  );
}

function SwipeToast({ id, tone, message, edge, action, lifetimeMs }: { id: number; tone: ToastTone; message: string; edge: 'up' | 'down'; action?: Toast['action']; lifetimeMs: number }) {
  const dismiss = useToastStore((s) => s.dismiss);
  const swipe = useSwipeDismiss(() => dismiss(id), edge);
  const base = `${swipe.flung ? '' : 'animate-backdrop-in'} select-none pointer-events-auto max-w-md w-full text-left text-sm font-medium text-white rounded-xl shadow-lg px-4 py-3 ${TONE_CLASSES[tone]}`;
  if (action) {
    // Message + action button side by side; the whole bar still swipes away.
    return (
      <div {...swipe.bind} style={swipe.style} className={`${base} flex items-center justify-between gap-3`}>
        <span className="min-w-0 flex-1">{message}</span>
        <CountdownRing ms={lifetimeMs} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            action.onClick();
            dismiss(id);
          }}
          className="shrink-0 rounded-md px-1 py-0.5 text-[13px] font-semibold uppercase tracking-wide text-[#7fd9a8] hover:text-white"
        >
          {action.label}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      {...swipe.bind}
      style={swipe.style}
      onClick={() => { if (!swipe.wasDragged()) dismiss(id); }}
      className={base}
    >
      {message}
    </button>
  );
}

/** Renders active toasts. Top ones sit clear of the notch; bottom ones sit
 *  above the nav bar (and above the network banner while that is showing).
 *  Tap one, or swipe it away, to dismiss it. */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const quality = useNetworkStore((s) => s.quality);

  if (toasts.length === 0) return null;
  const top = toasts.filter((t) => t.placement === 'top');
  const bottom = toasts.filter((t) => t.placement === 'bottom');
  // The network banner lives in the same bottom slot; stack above it.
  const lift = quality !== 'good' ? 84 : 0;

  return (
    <>
      <style>{`@keyframes toast-ring{from{stroke-dashoffset:0}to{stroke-dashoffset:${RING_C}}}`}</style>
      {top.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          data-toast-root
          className="fixed left-0 right-0 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none"
          style={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
        >
          {top.map((t) => (
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="up" action={t.action} lifetimeMs={t.lifetimeMs} />
          ))}
        </div>
      )}
      {bottom.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          data-toast-root
          className="fixed left-0 right-0 z-[71] flex flex-col items-center gap-2 px-4 pointer-events-none bottom-[calc(80px_+_env(safe-area-inset-bottom)_+_12px_+_var(--lift))] md:bottom-[calc(16px_+_var(--lift))]"
          style={{ ['--lift' as string]: `${lift}px` }}
        >
          {bottom.map((t) => (
            <SwipeToast key={t.id} id={t.id} tone={t.tone} message={t.message} edge="down" action={t.action} lifetimeMs={t.lifetimeMs} />
          ))}
        </div>
      )}
    </>
  );
}
