import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { checkResetToken, confirmReset } from '../utils/pinReset';
import { fieldBase } from '../components/ui';
import '../components/landing.css';

/** Public page behind the "Reset PIN" button in the email (/reset-pin?token=...). Works signed in or out. */
export default function ResetPinPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<'checking' | 'form' | 'invalid' | 'done'>('checking');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setState('invalid');
      return;
    }
    void checkResetToken('pin', token).then((res) => {
      if (!alive) return;
      if (res.ok) setState('form');
      else if (res.invalid) setState('invalid');
      else {
        setError(res.error ?? '');
        setState('form'); // network hiccup: let them try; confirm re-checks the link anyway
      }
    });
    return () => {
      alive = false;
    };
  }, [token]);

  const digits = (v: string) => v.replace(/\D/g, '').slice(0, 4);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (pin.length !== 4) return setError('PIN must be exactly 4 digits.');
    if (pin !== confirm) return setError('PINs do not match.');
    setBusy(true);
    setError('');
    const res = await confirmReset('pin', token, pin);
    setBusy(false);
    if (res.ok) setState('done');
    else if (res.invalid) setState('invalid');
    else setError(res.error ?? 'Could not reset the PIN. Please try again.');
  };

  const field = (label: string, value: string, set: (v: string) => void, placeholder: string, autoFocus = false) => (
    <div className="text-left">
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoComplete="off"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => set(digits(e.target.value))}
          placeholder={placeholder}
          className={`${fieldBase} w-full min-h-12 pr-11 py-2`}
        />
        <button
          type="button"
          aria-label={show ? 'Hide PIN' : 'Show PIN'}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-2 hover:text-ink"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[480px] text-center">
        <h1 className="fb-serif text-[40px] leading-none font-bold text-ink">Aurafin</h1>

        {state === 'checking' && <p className="mt-4 text-ink-2">Checking your link…</p>}

        {state === 'form' && (
          <>
            <p className="mt-3 mb-8 text-lg text-ink-2">Choose a new PIN</p>
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              {field('New PIN', pin, setPin, '4 digits', true)}
              {field('Confirm PIN', confirm, setConfirm, 'Re-enter your PIN')}
              {error && <p role="alert" className="text-sm text-red-500 text-left">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold transition-colors"
              >
                {busy ? 'Saving…' : 'Reset PIN'}
              </button>
            </form>
            <p className="mt-5 text-sm text-ink-2">
              Link not working? <a href="/" className="text-brand-600 hover:underline">Request a new one</a>
            </p>
          </>
        )}

        {state === 'invalid' && (
          <>
            <p className="mt-3 mb-6 text-lg text-ink-2">This link has expired</p>
            <p className="text-sm text-ink-2 mb-6">
              It is older than 1 hour or was already used. Open Aurafin and tap <span className="font-medium">Forgot PIN?</span> on the lock screen to get a new one.
            </p>
            <a href="/" className="inline-block w-full min-h-12 leading-[3rem] rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Open Aurafin</a>
          </>
        )}

        {state === 'done' && (
          <>
            <p className="mt-3 mb-6 text-lg text-ink-2">Your PIN has been changed</p>
            <p className="text-sm text-ink-2 mb-6">Open Aurafin and unlock it with your new PIN.</p>
            <a href="/" className="inline-block w-full min-h-12 leading-[3rem] rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold">Open Aurafin</a>
          </>
        )}
      </div>
    </div>
  );
}
