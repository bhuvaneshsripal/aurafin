import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { checkResetToken, confirmReset } from '../utils/pinReset';
import { fieldBase } from '../components/ui';
import '../components/landing.css';

const MIN_LENGTH = 6; // same rule as sign-up and Firebase itself

function PasswordField({ label, value, onChange, placeholder, autoFocus }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="text-left">
      <label className="block text-sm font-medium text-ink mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${fieldBase} w-full min-h-12 pr-11 py-2`}
        />
        <button
          type="button"
          aria-label={show ? 'Hide password' : 'Show password'}
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-2 hover:text-ink"
        >
          {show ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  );
}

/** Public page behind the "Reset Password" button in the email (/reset-password?token=...). Works signed in or out. */
export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') ?? '';
  const [state, setState] = useState<'checking' | 'form' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!token) {
      setState('invalid');
      return;
    }
    void checkResetToken('password', token).then((res) => {
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

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < MIN_LENGTH) return setError(`Password must be at least ${MIN_LENGTH} characters.`);
    if (password !== confirm) return setError('Passwords do not match.');
    setBusy(true);
    setError('');
    const res = await confirmReset('password', token, password);
    setBusy(false);
    if (res.ok) setState('done');
    else if (res.invalid) setState('invalid');
    else setError(res.error ?? 'Could not reset the password. Please try again.');
  };

  const openApp = 'inline-block w-full min-h-12 leading-[3rem] rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-semibold';

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[480px] text-center">
        <h1 className="fb-serif text-[40px] leading-none font-bold text-ink">Aurafin</h1>

        {state === 'checking' && <p className="mt-4 text-ink-2">Checking your link…</p>}

        {state === 'form' && (
          <>
            <p className="mt-3 mb-8 text-lg text-ink-2">Choose a new password</p>
            <form onSubmit={(e) => void submit(e)} className="space-y-4">
              <PasswordField label="New password" value={password} onChange={setPassword} placeholder={`At least ${MIN_LENGTH} characters`} autoFocus />
              <PasswordField label="Confirm password" value={confirm} onChange={setConfirm} placeholder="Re-enter your password" />
              {error && <p role="alert" className="text-sm text-red-500 text-left">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full min-h-12 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white font-semibold transition-colors"
              >
                {busy ? 'Saving…' : 'Reset password'}
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
              It is older than 1 hour or was already used. In Aurafin, open <span className="font-medium">Settings &gt; Change password</span> and tap <span className="font-medium">Email me a link</span> to get a new one.
            </p>
            <a href="/" className={openApp}>Open Aurafin</a>
          </>
        )}

        {state === 'done' && (
          <>
            <p className="mt-3 mb-6 text-lg text-ink-2">Your password has been set</p>
            <p className="text-sm text-ink-2 mb-6">You can now sign in to Aurafin with your email and this password, as well as with Google.</p>
            <a href="/" className={openApp}>Open Aurafin</a>
          </>
        )}
      </div>
    </div>
  );
}
