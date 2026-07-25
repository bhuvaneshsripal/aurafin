import { useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { useAppLockStore } from '../store/appLockStore';
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

  if (!locked) return null;

  const submitPin = () => {
    if (pin.length !== 4) return;
    const ok = unlock(pin);
    if (!ok) setPinInput('');
  };

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cream-100 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm text-center">
        <div className="h-14 w-14 rounded-2xl bg-brand-600 text-white flex items-center justify-center mx-auto mb-5">
          <Lock size={26} />
        </div>

        {mode === 'pin' && (
          <>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white mb-1">Enter your PIN</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">Aurafin is locked</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              value={pin}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && submitPin()}
              className="w-full text-center text-2xl tracking-[0.5em] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {pinAttemptError && <p className="text-sm text-red-500 mt-2">{pinAttemptError}</p>}
            <button
              onClick={submitPin}
              disabled={pin.length !== 4}
              className="w-full mt-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
            >
              Unlock
            </button>
            <button
              onClick={requestOtp}
              disabled={otpStatus === 'sending'}
              className="text-sm text-brand-600 dark:text-brand-400 font-medium mt-4"
            >
              {otpStatus === 'sending' ? 'Sending code...' : 'Forgot PIN?'}
            </button>
            {otpStatus === 'error' && <p className="text-xs text-red-500 mt-2">{otpError}</p>}
            {!isOtpEmailConfigured() && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                Email reset isn't configured yet on this deployment.
              </p>
            )}
          </>
        )}

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
              className="w-full text-center text-2xl tracking-[0.4em] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-3 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {otpError && <p className="text-sm text-red-500 mt-2">{otpError}</p>}
            <button
              onClick={verifyOtp}
              disabled={otpCode.length !== 6}
              className="w-full mt-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
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
            <div className="space-y-3">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                placeholder="New PIN"
                className="w-full text-center text-2xl tracking-[0.5em] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-3 placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="Confirm PIN"
                className="w-full text-center text-2xl tracking-[0.5em] border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-3 placeholder:text-sm placeholder:tracking-normal placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            {otpError && <p className="text-sm text-red-500 mt-2">{otpError}</p>}
            <button
              onClick={resetPin}
              className="w-full mt-4 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
            >
              Save New PIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
