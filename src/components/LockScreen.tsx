import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Delete } from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
import PinBoxInput from './PinBoxInput';
import { useAuthStore } from '../store/authStore';
import { sendPinResetOtp, verifyPinResetOtp, isOtpEmailConfigured } from '../utils/otp';

export default function LockScreen() {
  const { locked, pinAttemptError, unlock, setPin } = useAppLockStore();
  const user = useAuthStore((s) => s.user);
  const [pin, setPinInput] = useState('');
  const [shake, setShake] = useState(false);
  const [mode, setMode] = useState<'pin' | 'otp-sent' | 'reset'>('pin');
  const [otpStatus, setOtpStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [otpError, setOtpError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

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
      setMode('pin');
    }
  }, [locked]);

  // Physical keyboard support (desktop/laptop)
  useEffect(() => {
    if (!locked || mode !== 'pin') return;
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
  }, [locked, mode, pressDigit, submitPin]);

  if (!shouldRender) return null;

  const requestOtp = async () => {
    if (!user?.email) return;
    setOtpStatus('sending');
    setOtpError('');
    try {
      await sendPinResetOtp(user.email);
      setOtpStatus('sent');
      setMode('otp-sent');
    } catch (err) {
      setOtpStatus('error');
      setOtpError(err instanceof Error ? err.message : 'Could not send code.');
    }
  };

  const verifyOtp = () => {
    if (!user?.email) return;
    const ok = verifyPinResetOtp(user.email, otpCode);
    if (ok) {
      setMode('reset');
      setOtpError('');
    } else {
      setOtpError('That code is incorrect or has expired.');
    }
  };

  const resetPin = () => {
    if (!/^\d{4}$/.test(newPin) || newPin !== confirmPin) {
      setOtpError('Enter matching 4-digit PINs.');
      return;
    }
    setPin(newPin);
    setPinInput('');
    setMode('pin');
    setOtpCode('');
    setNewPin('');
    setConfirmPin('');
  };

  return (
    <div
      className={`font-luxury fixed inset-0 z-[100] flex flex-col bg-sandal-100 dark:bg-sandal-900 px-6 pt-12 pb-8 overflow-y-auto overflow-x-hidden ${
        unlocking ? 'animate-lock-unlock pointer-events-none' : 'animate-lock-in'
      }`}
    >
      {/* Soft blurred sandal-toned orbs — purely decorative, they give the
          glassmorphism keypad below something translucent to sit on top of. */}
      <div className="pointer-events-none absolute -top-16 -left-16 h-64 w-64 rounded-full bg-sandal-300/40 dark:bg-sandal-600/20 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 -right-20 h-72 w-72 rounded-full bg-sandal-400/30 dark:bg-sandal-500/15 blur-3xl" />
      {mode === 'pin' ? (
        <>
          <div className="w-full max-w-[300px] mx-auto text-center flex flex-col items-center">
            <img
              src="/logo-icon.png"
              alt="Aurafin"
              className="h-14 w-14 rounded-full object-cover mb-4"
            />
            <h1 className="font-luxury text-xl font-bold text-slate-900 dark:text-white mb-1">
              Aurafin is Locked
            </h1>
            <p className="font-luxury text-sm text-slate-500 dark:text-slate-400 mb-6">Enter your 4-digit PIN</p>

            {/* PIN dots — pop up in size the instant a digit is entered, and
                shrink back down on backspace/clear, so the count is felt as
                much as seen. */}
            <div className={`flex items-center justify-center gap-3 ${shake ? 'animate-shake' : ''}`}>
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`keep-round border-2 transition-all duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
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
            <div className="grid grid-cols-3 gap-4 w-full max-w-[300px]">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => pressDigit(d)}
                  className="font-luxury aspect-square rounded-2xl bg-white shadow-[0_8px_22px_-4px_rgba(0,0,0,0.45)] text-2xl font-semibold text-slate-800 active:scale-[0.85] active:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.3)] transition-transform duration-75 ease-out will-change-transform"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className="font-luxury aspect-square rounded-2xl bg-white shadow-[0_8px_22px_-4px_rgba(0,0,0,0.45)] text-2xl font-semibold text-slate-800 active:scale-[0.85] active:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.3)] transition-transform duration-75 ease-out will-change-transform"
              >
                0
              </button>
              <button
                type="button"
                onClick={pressBackspace}
                className="aspect-square rounded-2xl bg-white shadow-[0_8px_22px_-4px_rgba(0,0,0,0.45)] flex items-center justify-center text-slate-700 active:scale-[0.85] active:shadow-[0_2px_6px_-2px_rgba(0,0,0,0.3)] transition-transform duration-75 ease-out will-change-transform"
              >
                <Delete size={24} />
              </button>
            </div>

            <button
              onClick={requestOtp}
              disabled={otpStatus === 'sending'}
              className="font-luxury text-xs text-slate-500 font-medium mt-6 active:scale-95 transition-transform duration-75"
            >
              {otpStatus === 'sending' ? 'Sending code...' : 'Forgot PIN? Tap to reset via email'}
            </button>
            {otpStatus === 'error' && <p className="font-luxury text-xs text-red-500 mt-2">{otpError}</p>}
            {!isOtpEmailConfigured() && (
              <p className="font-luxury text-xs text-slate-500 mt-2">
                Email reset isn't configured yet on this deployment.
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="m-auto w-full max-w-[300px] text-center flex flex-col items-center">
          <img
            src="/logo-icon.png"
            alt="Aurafin"
            className="h-14 w-14 rounded-full object-cover mb-4"
          />

          {mode === 'otp-sent' && (
            <>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">Check your email</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                We sent a 6-digit code to {user?.email}
              </p>
              <input
                inputMode="numeric"
                maxLength={6}
                autoFocus
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full text-center text-2xl tracking-[0.4em] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-2xl px-3 py-3 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              {otpError && <p className="text-sm text-red-500 mt-2">{otpError}</p>}
              <button
                onClick={verifyOtp}
                disabled={otpCode.length !== 6}
                className="w-full mt-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-full text-sm font-medium"
              >
                Verify Code
              </button>
              <button
                onClick={() => setMode('pin')}
                className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-4"
              >
                Back
              </button>
            </>
          )}

          {mode === 'reset' && (
            <>
              <ShieldCheck size={20} className="text-brand-600 mx-auto mb-2" />
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">Set a new PIN</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Choose a new 4-digit PIN</p>
              <div className="space-y-4 w-full">
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">New PIN</p>
                  <PinBoxInput value={newPin} onChange={setNewPin} autoFocus />
                </div>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Confirm PIN</p>
                  <PinBoxInput value={confirmPin} onChange={setConfirmPin} />
                </div>
              </div>
              {otpError && <p className="text-sm text-red-500 mt-2">{otpError}</p>}
              <button
                onClick={resetPin}
                className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-full text-sm font-medium"
              >
                Save New PIN
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
