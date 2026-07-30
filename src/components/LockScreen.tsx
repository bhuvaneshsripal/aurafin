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
  const [mode, setMode] = useState<'pin' | 'otp-sent' | 'reset'>('pin');
  const [otpStatus, setOtpStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [otpError, setOtpError] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');

  const submitPin = useCallback(
    (value?: string) => {
      const candidate = value ?? pin;
      if (candidate.length !== 4) return;
      unlock(candidate);
      // Clear either way — on success there's nothing left to show, and on
      // failure the field already resets. Otherwise LockScreen (which stays
      // mounted and just renders null while unlocked) would still be
      // holding the last 4 digits next time it re-locks, so the dots would
      // look pre-filled and further digits would silently do nothing.
      setPinInput('');
    },
    [pin, unlock]
  );

  const pressDigit = useCallback(
    (digit: string) => {
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
    [submitPin]
  );

  const pressBackspace = () => {
    setPinInput((p) => p.slice(0, -1));
  };

  // Whenever the screen (re)locks — including auto-lock after returning from
  // the background, not just the initial mount — make sure the box starts
  // empty rather than showing whatever was last typed.
  useEffect(() => {
    if (locked) {
      setPinInput('');
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

  if (!locked) return null;

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
    <div className="font-luxury fixed inset-0 z-[100] flex flex-col bg-cream-100 dark:bg-slate-950 px-6 pt-12 pb-8 overflow-y-auto">
      {mode === 'pin' ? (
        <>
          <div className="w-full max-w-[300px] mx-auto text-center flex flex-col items-center">
            <img
              src="/logo-icon.png"
              alt="Aurafin"
              className="h-14 w-14 rounded-2xl object-cover mb-4 shadow-sm"
            />
            <h1 className="font-luxury text-xl font-bold text-slate-900 dark:text-white mb-1">
              Aurafin is Locked
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Enter your 4-digit PIN</p>

            {/* PIN dots */}
            <div className="flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={`keep-round h-3 w-3 border-2 transition-colors ${
                    i < pin.length
                      ? 'bg-brand-600 border-brand-600'
                      : 'bg-transparent border-slate-300 dark:border-slate-600'
                  }`}
                />
              ))}
            </div>

            {pinAttemptError && <p className="text-sm text-red-500 mt-3">{pinAttemptError}</p>}
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
                  className="keep-round aspect-square rounded-full bg-white dark:bg-slate-800 border border-cream-200 dark:border-slate-700 shadow-sm text-2xl font-semibold text-slate-900 dark:text-white active:scale-95 active:bg-cream-50 dark:active:bg-slate-700 transition-transform"
                >
                  {d}
                </button>
              ))}
              <div />
              <button
                type="button"
                onClick={() => pressDigit('0')}
                className="keep-round aspect-square rounded-full bg-white dark:bg-slate-800 border border-cream-200 dark:border-slate-700 shadow-sm text-2xl font-semibold text-slate-900 dark:text-white active:scale-95 active:bg-cream-50 dark:active:bg-slate-700 transition-transform"
              >
                0
              </button>
              <button
                type="button"
                onClick={pressBackspace}
                className="keep-round aspect-square rounded-full bg-white dark:bg-slate-800 border border-cream-200 dark:border-slate-700 shadow-sm flex items-center justify-center text-slate-500 dark:text-slate-300 active:scale-95 active:bg-cream-50 dark:active:bg-slate-700 transition-transform"
              >
                <Delete size={24} />
              </button>
            </div>

            <button
              onClick={requestOtp}
              disabled={otpStatus === 'sending'}
              className="text-xs text-slate-400 dark:text-slate-500 font-medium mt-6"
            >
              {otpStatus === 'sending' ? 'Sending code...' : 'Forgot PIN? Tap to reset via email'}
            </button>
            {otpStatus === 'error' && <p className="text-xs text-red-500 mt-2">{otpError}</p>}
            {!isOtpEmailConfigured() && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
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
            className="h-14 w-14 rounded-2xl object-cover mb-4 shadow-sm"
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
