import { useEffect, useState } from 'react';
import { Eye, EyeOff, X } from 'lucide-react';
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

/** A small card that slides in when the app is opened fresh with the eye
 *  still closed, inviting the person to reveal their amounts. */
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

  // Stays until the person taps Show or dismisses it (or opens the eye
  // some other way) — it never times out on its own.
  useEffect(() => {
    if (open && !privacyMode) close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [privacyMode]);

  if (!open) return null;

  return (
    <div className="fixed left-0 right-0 z-[90] flex justify-center px-4 pointer-events-none top-[calc(env(safe-area-inset-top)_+_64px)]">
      <div
        role="alert"
        className={`${leaving ? 'eye-prompt-out' : 'eye-prompt-in'} pointer-events-auto relative w-full max-w-[420px] overflow-hidden flex items-center gap-3.5 rounded-[20px] border border-line bg-surface/95 backdrop-blur-md pl-4 pr-3 py-3 shadow-[0_14px_40px_-12px_rgba(0,0,0,0.55)]`}
      >
        {/* soft green glow along the top edge */}
        <span aria-hidden className="absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-positive to-transparent opacity-70" />
        <span className="relative shrink-0 inline-flex h-11 w-11 items-center justify-center rounded-full bg-primary-soft text-primary-ink">
          <span aria-hidden className="eye-prompt-ring absolute inset-0 rounded-full border border-positive/60" />
          <EyeOff size={20} className="eye-prompt-off absolute" />
          <Eye size={20} className="eye-prompt-on absolute" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink leading-snug">Your amounts are hidden</p>
          <p className="text-xs text-muted leading-snug mt-0.5">Open the eye to see your numbers.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            togglePrivacy();
            close();
          }}
          className="shrink-0 h-9 px-3.5 rounded-full bg-primary text-white text-[13px] font-semibold hover:bg-primary-hover active:scale-[0.97] transition"
        >
          Show
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Dismiss"
          className="shrink-0 h-8 w-8 inline-flex items-center justify-center rounded-full text-faint hover:text-ink hover:bg-surface-hover"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
