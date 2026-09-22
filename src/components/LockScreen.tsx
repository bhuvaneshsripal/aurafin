import { useState, useEffect, useCallback } from 'react';
import { Delete } from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';

export default function LockScreen() {
  const { locked, pinAttemptError, unlock } = useAppLockStore();
  const [pin, setPinInput] = useState('');
  const [shake, setShake] = useState(false);

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

  const submitPin = useCallback(
    (value?: string) => {
      if (shake) return;
      const candidate = value ?? pin;
      if (candidate.length !== 4) return;
      const ok = unlock(candidate);
      if (ok) {
        setPinInput('');
        return;
      }
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
      window.setTimeout(() => {
        setShake(false);
        setPinInput('');
      }, 420);
    },
    [pin, shake, unlock]
  );

  const pressDigit = useCallback(
    (digit: string) => {
      if (shake) return;
      setPinInput((prev) => {
        if (prev.length >= 4) return prev;
        const next = prev + digit;
        if (next.length === 4) {
          // defer so state has settled before we validate
          queueMicrotask(() => submitPin(next));
        }
        return next;
      });
    },
    [shake, submitPin]
  );

  const pressBackspace = () => {
    if (shake) return;
    setPinInput((p) => p.slice(0, -1));
  };

  // Whenever the screen (re)locks — including auto-lock after returning from
  // the background, not just the initial mount — make sure the box starts
  // empty rather than showing whatever was last typed.
  useEffect(() => {
    if (locked) {
      setPinInput('');
      setShake(false);
    }
  }, [locked]);

  // Physical keyboard support (desktop/laptop)
  useEffect(() => {
    if (!locked) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        pressDigit(e.key);
      } else if (e.key === 'Backspace') {
        pressBackspace();
      } else if (e.key === 'Enter') {
        submitPin();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [locked, pressDigit, submitPin]);

  if (!shouldRender) return null;

  return (
    <div
      className={`font-luxury fixed inset-0 z-[100] flex flex-col bg-page px-6 pt-12 pb-8 overflow-y-auto overflow-x-hidden ${
        unlocking ? 'animate-lock-unlock pointer-events-none' : 'animate-lock-in'
      }`}
    >
      <div className="w-full max-w-[300px] mx-auto text-center flex flex-col items-center">
        <img
          src="/logo-icon.png"
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

        {pinAttemptError && <p className="font-luxury text-sm text-red-500 mt-3">{pinAttemptError}</p>}
      </div>

      {/* Spacer — pushes the keypad toward the bottom of the screen so
          it's within comfortable thumb-reach one-handed, instead of
          floating in the exact vertical middle of a tall phone screen. */}
      <div className="flex-1 min-h-6" />

      <div className="w-full max-w-[300px] mx-auto flex flex-col items-center">
        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => pressDigit(d)}
              className="h-14 rounded-xl border border-line bg-surface shadow-xs text-xl font-semibold text-ink hover:bg-surface-hover active:scale-95 transition-all duration-100"
            >
              {d}
            </button>
          ))}
          <div />
          <button
            type="button"
            onClick={() => pressDigit('0')}
            className="h-14 rounded-xl border border-line bg-surface shadow-xs text-xl font-semibold text-ink hover:bg-surface-hover active:scale-95 transition-all duration-100"
          >
            0
          </button>
          <button
            type="button"
            onClick={pressBackspace}
            className="h-14 rounded-xl border border-line bg-surface shadow-xs flex items-center justify-center text-ink-2 hover:bg-surface-hover active:scale-95 transition-all duration-100"
          >
            <Delete size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
