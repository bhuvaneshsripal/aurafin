import { useState } from 'react';
import { ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { friendlyAuthError } from '../utils/authErrors';

interface SignUpScreenProps {
  onBack: () => void;
  onLogin: () => void;
}

function FieldError({ message }: { message: string }) {
  return (
    <p className="lf-msg" role="alert">
      {message}
    </p>
  );
}

/** Full-screen sign-up page on a light sandal background. */
export default function SignUpScreen({ onBack, onLogin }: SignUpScreenProps) {
  const { loginWithGoogle, registerWithEmail } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async () => {
    setError('');
    const trimmed = email.trim();
    const eErr = !trimmed ? 'Enter an email' : !/^\S+@\S+\.\S+$/.test(trimmed) ? 'Enter a valid email' : '';
    const pErr = !password ? 'Enter a password' : password.length < 6 ? 'Use at least 6 characters' : '';
    setEmailErr(eErr);
    setPassErr(pErr);
    if (eErr || pErr) return;
    setBusy(true);
    try {
      await registerWithEmail(trimmed, password);
    } catch (e) {
      setError(friendlyAuthError(e, 'We couldn’t create your account. Please try again.'));
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setError(friendlyAuthError(e, 'Google sign-in failed. Please try again.'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="su-screen">
      <button type="button" className="su-back" onClick={onBack} aria-label="Back to home">
        <ArrowLeft size={18} /> Back
      </button>

      <main className="su-card" aria-labelledby="su-title">
        <p className="su-kicker">Get started</p>
        <h1 id="su-title" className="su-title font-brand">
          Create your account
        </h1>
        <p className="su-sub">Track stocks, crypto, cash and goals in one place.</p>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading}
          className="su-google btn-press"
        >
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z" />
            <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
            <path fill="#FBBC05" d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" />
            <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z" />
          </svg>
          {googleLoading ? 'Connecting…' : 'Continue with Google'}
        </button>

        <div className="su-divider">
          <span>or use email</span>
        </div>

        <div className="su-fields">
          <div className={`lf${emailErr ? ' lf-err' : ''}`}>
            <input
              id="su-email"
              type="email"
              autoComplete="email"
              placeholder=" "
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailErr) setEmailErr('');
              }}
              aria-invalid={!!emailErr}
              className="lf-input"
            />
            <label htmlFor="su-email" className="lf-label">Email</label>
            {emailErr && <FieldError message={emailErr} />}
          </div>

          <div className={`lf${passErr ? ' lf-err' : ''}`}>
            <input
              id="su-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder=" "
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (passErr) setPassErr('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
              aria-invalid={!!passErr}
              className="lf-input has-eye"
            />
            <label htmlFor="su-password" className="lf-label">Password</label>
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="lf-eye"
            >
              {showPassword ? <EyeOff size="1.125em" /> : <Eye size="1.125em" />}
            </button>
            {passErr && <FieldError message={passErr} />}
          </div>

          {error && <p className="su-error" role="alert">{error}</p>}

          <button type="button" onClick={submit} disabled={busy} className="su-submit btn-press">
            {busy ? 'Creating account…' : 'Sign Up'}
          </button>
        </div>

        <p className="su-switch">
          Already have an account?{' '}
          <button type="button" onClick={onLogin}>
            Log in
          </button>
        </p>
      </main>
    </div>
  );
}
