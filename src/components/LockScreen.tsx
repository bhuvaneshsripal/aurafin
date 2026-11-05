import { useState, useEffect, useCallback, useRef } from 'react';
import { Delete, LogOut, Moon, MoreVertical, Sun } from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
import { useAuthStore } from '../store/authStore';
import { useUiStore } from '../store/uiStore';
import { toast } from '../store/toastStore';
import { LOGO_SRC } from '../config/logo';

const KEY_CLASS =
  'aspect-square w-full rounded-2xl border border-line bg-surface shadow-xs select-none hover:bg-surface-hover transition-colors duration-100 focus-visible:outline-2 focus-visible:outline-brand-600';

export default function LockScreen() {
  const locked = useAppLockStore((s) => s.locked);
  const pinAttemptError = useAppLockStore((s) => s.pinAttemptError);
  const unlock = useAppLockStore((s) => s.unlock);
  const [pin, setPinInput] = useState('');
  const [shake, setShake] = useState(false);
  const [, setChecking] = useState(false);
  // Refs mirror the state so very fast typing never reads a stale value
  // (two quick taps used to land in the same render and drop a digit).
  const pinRef = useRef('');
  const busyRef = useRef(false); // wrong-PIN shake or cache check running
  const keyEls = useRef<Record<string, HTMLButtonElement | null>>({});

  // Three-dot menu (top right): switch theme or log out without unlocking.
  const theme = useUiStore((st) => st.theme);
  const toggleTheme = useUiStore((st) => st.toggleTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const handleLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setMenuOpen(false);
    try {
      await useAuthStore.getState().logout();
    } catch {
      setSigningOut(false);
      toast.error('Could not log out. Please check your connection and try again.');
    }
  };
  const setPin = useCallback((v: string) => {
    pinRef.current = v;
    setPinInput(v);
  }, []);

  // Keeps the lock screen mounted for one more animation frame after a
  // correct PIN unlocks it, so it fades/scales smoothly away instead of
  // vanishing the instant `locked` flips to false.
  const [shouldRender, setShouldRender] = useState(locked);
  const [unlocking, setUnlocking] = useState(false);

  useEffect(() => {
    if (locked) {
      setShouldRender(true);
      setUnlocking(false);
      return;
    }
    if (!shouldRender) return;
    setUnlocking(true);
    const timer = window.setTimeout(() => {
      setShouldRender(false);
      setUnlocking(false);
    }, 380);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locked]);

  const rejectPin = useCallback(() => {
    // Wrong PIN: shake with the 4 dots still filled (so the person can see
    // *what* they typed was rejected), then clear once the shake finishes.
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(200);
      } catch {
        // best-effort haptic only — never block on it
      }
    }
    setShake(true);
    busyRef.current = true;
    window.setTimeout(() => {
      setShake(false);
      busyRef.current = false;
      setPin('');
    }, 420);
  }, [setPin]);

  const submitPin = useCallback(
    (value?: string) => {
      if (busyRef.current) return;
      const candidate = value ?? pinRef.current;
      if (candidate.length !== 4) return;
      const { _storedPin, unlockWithCache } = useAppLockStore.getState();
      if (!_storedPin) {
        // The PIN hasn't loaded from Firestore (no/low network). Check against
        // the hashed copy cached on this device so a correct PIN still opens.
        busyRef.current = true;
        setChecking(true);
        void unlockWithCache(candidate).then((result) => {
          busyRef.current = false;
          setChecking(false);
          if (result === 'ok') {
            setPin('');
          } else if (result === 'wrong') {
            rejectPin();
          } else {
            // Nothing cached yet (first sign-in on this device): can't verify.
            window.setTimeout(() => setPin(''), 300);
          }
        });
        return;
      }
      const ok = unlock(candidate);
      if (ok) {
        setPin('');
        return;
      }
      rejectPin();
    },
    [unlock, rejectPin, setPin]
  );

  /** Quick squish + green flash on the pressed key (touch, mouse or keyboard). */
  const animateKey = useCallback((id: string) => {
    const el = keyEls.current[id];
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [
        { transform: 'scale(1)', backgroundColor: 'var(--color-brand-100, #d1fae5)', offset: 0 },
        { transform: 'scale(0.88)', backgroundColor: 'var(--color-brand-100, #d1fae5)', offset: 0.35 },
        { transform: 'scale(1)', backgroundColor: 'transparent', offset: 1 },
      ],
      { duration: 220, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
    );
  }, []);

  const buzz = () => {
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(8);
      } catch {
        /* best-effort haptic */
      }
    }
  };

  const pressDigit = useCallback(
    (digit: string) => {
      if (busyRef.current) return;
      const cur = pinRef.current;
      if (cur.length >= 4) return;
      const next = cur + digit;
      setPin(next);
      if (next.length === 4) submitPin(next);
    },
    [submitPin, setPin]
  );

  const pressBackspace = useCallback(() => {
    if (busyRef.current) return;
    setPin(pinRef.current.slice(0, -1));
  }, [setPin]);

  // Whenever the screen (re)locks — including auto-lock after returning from
  // the background, not just the initial mount — make sure the box starts
  // empty rather than showing whatever was last typed.
  useEffect(() => {
    if (locked) {
      setPin('');
      setShake(false);
      busyRef.current = false;
    }
  }, [locked, setPin]);

  // Physical keyboard support (desktop/laptop)
  useEffect(() => {
    if (!locked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.length === 1 && e.key >= '0' && e.key <= '9') {
        // Held-down key repeat must not type extra digits; fast separate presses all count.
        if (e.repeat) return;
        animateKey(e.key);
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        animateKey('back');
        pressBackspace();
      } else if (e.key === 'Enter') {
        submitPin();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [locked, pressDigit, pressBackspace, submitPin, animateKey]);

  if (!shouldRender) return null;

  return (
    <div
      className={`font-luxury fixed inset-0 z-[100] flex flex-col bg-page px-6 pt-12 pb-8 overflow-y-auto overflow-x-hidden ${
        unlocking ? 'animate-lock-unlock pointer-events-none' : 'animate-lock-in'
      }`}
    >
      <div ref={menuRef} className="fixed right-4 top-[calc(env(safe-area-inset-top)+12px)] z-10">
        <button
          type="button"
          aria-label="Menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
          className="tap-scale keep-round h-10 w-10 inline-flex items-center justify-center text-ink-2 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <MoreVertical size={20} />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="animate-menu-in absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-line bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                toggleTheme();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-ink-2 hover:bg-surface-hover"
            >
              {theme === 'dark' ? <Sun size={17} className="text-muted" /> : <Moon size={17} className="text-muted" />}
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="border-t border-line-soft" />
            <button
              type="button"
              role="menuitem"
              onClick={() => void handleLogout()}
              disabled={signingOut}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-surface-hover disabled:opacity-60"
            >
              <LogOut size={17} />
              {signingOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        )}
      </div>

      <div className="w-full max-w-[300px] mx-auto text-center flex flex-col items-center">
        <img
          src={LOGO_SRC}
          alt="Aurafin"
          className="h-14 w-14 rounded-full object-cover mb-4"
        />
        <h1 className="text-xl font-semibold text-ink mb-1">
          Aurafin is Locked
        </h1>
        <p className="font-luxury text-sm text-muted mb-6">Enter your 4-digit PIN</p>

        {/* PIN dots — pop up in size the instant a digit is entered, and
            shrink back down on backspace/clear, so the count is felt as
            much as seen. */}
        <div className={`flex items-center justify-center gap-3 ${shake ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`keep-round border-2 transition-all duration-200 ease-out ${
                i < pin.length
                  ? shake
                    ? 'h-4 w-4 bg-red-500 border-red-500'
                    : 'h-4 w-4 bg-brand-600 border-brand-600'
                  : 'h-2.5 w-2.5 bg-transparent border-slate-300 dark:border-slate-600'
              }`}
            />
          ))}
        </div>

        {pinAttemptError && (
          <p role="alert" className="font-luxury text-sm text-red-500 mt-3">
            {pinAttemptError}
          </p>
        )}
      </div>

      {/* Spacer — pushes the keypad toward the bottom of the screen so
          it's within comfortable thumb-reach one-handed, instead of
          floating in the exact vertical middle of a tall phone screen. */}
      <div className="flex-1 min-h-6" />

      <div className="w-full max-w-[300px] mx-auto flex flex-col items-center">
        {/* Keypad: square keys. They react on press-down (not release) so typing
            feels instant, and each one squishes + flashes when hit. */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[264px]" style={{ touchAction: 'manipulation' }}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              ref={(el) => { keyEls.current[d] = el; }}
              type="button"
              aria-label={d}
              onPointerDown={(e) => {
                e.preventDefault(); // no focus ring / text selection while tapping fast
                buzz();
                animateKey(d);
                pressDigit(d);
              }}
              onClick={(e) => { if (e.detail === 0) pressDigit(d); }} // keyboard activation (Enter/Space)
              className={KEY_CLASS + ' text-2xl font-semibold text-ink'}
            >
              {d}
            </button>
          ))}
          <div />
          <button
            ref={(el) => { keyEls.current['0'] = el; }}
            type="button"
            aria-label="0"
            onPointerDown={(e) => {
              e.preventDefault();
              buzz();
              animateKey('0');
              pressDigit('0');
            }}
            onClick={(e) => { if (e.detail === 0) pressDigit('0'); }}
            className={KEY_CLASS + ' text-2xl font-semibold text-ink'}
          >
            0
          </button>
          <button
            ref={(el) => { keyEls.current['back'] = el; }}
            type="button"
            aria-label="Delete"
            onPointerDown={(e) => {
              e.preventDefault();
              buzz();
              animateKey('back');
              pressBackspace();
            }}
            onClick={(e) => { if (e.detail === 0) pressBackspace(); }}
            className={KEY_CLASS + ' flex items-center justify-center text-ink-2'}
          >
            <Delete size={22} />
          </button>
        </div>
      </div>
    </div>
  );
}
