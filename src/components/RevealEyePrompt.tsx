import { useEffect, useState } from 'react';
import { EyeOff } from 'lucide-react';
import { useUiStore } from '../store/uiStore';
import { useAppLockStore } from '../store/appLockStore';

// sessionStorage is wiped when the app/tab is really closed, so the nudge
// shows once per fresh open — not on every refresh or page change.
const SHOWN_KEY = 'aurafin-eye-prompt-shown';

function wasShown(): boolean {
  try {
    return sessionStorage.getItem(SHOWN_KEY) === '1';
  } catch {
    return false;
  }
}
function markShown() {
  try {
    sessionStorage.setItem(SHOWN_KEY, '1');
  } catch {
    // ignore
  }
}

/** How long the notice stays on screen, in seconds. */
const VISIBLE_SECONDS = 4;

/** A small dark toast that slides up above the bottom bar when the app is
 *  opened fresh with the eye still closed, inviting the person to reveal
 *  their amounts. It covers almost nothing, shows a 4-second countdown ring
 *  and hides itself — there is deliberately no way to dismiss it by hand
 *  (the Show button only reveals the amounts). */
export default function RevealEyePrompt() {
  const privacyMode = useUiStore((s) => s.privacyMode);
  const togglePrivacy = useUiStore((s) => s.togglePrivacy);
  const locked = useAppLockStore((s) => s.locked);
  const [open, setOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Appear once the app is unlocked and the amounts are hidden.
  useEffect(() => {
    if (open || !privacyMode || locked || wasShown()) return;
    const t = window.setTimeout(() => {
      markShown();
      setOpen(true);
    }, 700);
    return () => window.clearTimeout(t);
  }, [open, privacyMode, locked]);

  const close = () => {
    setLeaving(true);
    window.setTimeout(() => {
      setOpen(false);
      setLeaving(false);
    }, 180);
  };

  // Countdown: the ring drains over VISIBLE_SECONDS (CSS), the number ticks
  // down once a second, and the toast hides itself when time is up.
  const [secs, setSecs] = useState(VISIBLE_SECONDS);
  useEffect(() => {
    if (!open) return;
    setSecs(VISIBLE_SECONDS);
    const tick = window.setInterval(() => setSecs((n) => Math.max(1, n - 1)), 1000);
    const done = window.setTimeout(close, VISIBLE_SECONDS * 1000);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Opening the eye some other way also clears it.
  useEffect(() => {
    if (open && !privacyMode) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacyMode]);

  if (!open) return null;

  return (
    <div className="fixed left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none bottom-[calc(env(safe-area-inset-bottom)+96px)] md:bottom-6">
      <div
        role="status"
        aria-live="polite"
        className={`${leaving ? 'eye-toast-out' : 'eye-toast-in'} pointer-events-auto flex items-center gap-2.5 whitespace-nowrap rounded-full bg-[#1B2420] py-1.5 pl-4 pr-1.5 text-white shadow-[0_8px_24px_rgba(20,30,25,0.28)]`}
      >
        <EyeOff size={17} aria-hidden="true" />
        <span className="text-sm font-medium">Amounts are hidden</span>
        <button
          type="button"
          onClick={() => {
            togglePrivacy();
            close();
          }}
          className="h-[34px] shrink-0 rounded-full bg-white px-4 text-sm font-bold text-[#17402B] active:scale-[0.97] transition"
        >
          Show
        </button>
        {/* 4-second countdown: the ring drains, the number counts down. */}
        <span className="relative inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center" aria-hidden="true">
          <svg width="34" height="34" viewBox="0 0 34 34" className="absolute inset-0 -rotate-90">
            <circle cx="17" cy="17" r="14" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="3" />
            <circle
              cx="17"
              cy="17"
              r="14"
              fill="none"
              stroke="#7FD6A4"
              strokeWidth="3"
              strokeLinecap="round"
              className="eye-countdown-ring"
              style={{ animationDuration: `${VISIBLE_SECONDS}s` }}
            />
          </svg>
          <span className="relative text-[13px] font-semibold tabular-nums">{secs}</span>
        </span>
      </div>
    </div>
  );
}
