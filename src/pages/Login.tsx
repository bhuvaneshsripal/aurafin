import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { friendlyAuthError } from '../utils/authErrors';
import LoginShowcase from '../components/LoginShowcase';
import Modal from '../components/Modal';

function FieldError({ message }: { message: string }) {
  return (
    <p className="lf-msg" role="alert">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <rect x="11" y="6" width="2" height="8" rx="1" fill="#fff" />
        <circle cx="12" cy="17.5" r="1.3" fill="#fff" />
      </svg>
      {message}
    </p>
  );
}

export default function Login() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail } = useAuthStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [emailErr, setEmailErr] = useState('');
  const [passErr, setPassErr] = useState('');
  const [open, setOpen] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const submit = async () => {
    setError('');
    const trimmed = email.trim();
    const eErr = !trimmed ? 'Enter an email' : !/^\S+@\S+\.\S+$/.test(trimmed) ? 'Enter a valid email' : '';
    const pErr = !password ? 'Enter a password' : '';
    setEmailErr(eErr);
    setPassErr(pErr);
    if (eErr || pErr) return;
    try {
      if (mode === 'login') await loginWithEmail(email, password);
      else await registerWithEmail(email, password);
    } catch (e) {
      setError(
        friendlyAuthError(e, mode === 'login' ? 'We couldn\u2019t log you in. Please try again.' : 'We couldn\u2019t create your account. Please try again.')
      );
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (e) {
      // signInWithPopup rejects (e.g. popup blocked, closed by the user,
      // an unauthorized domain, or a misconfigured Firebase project) and
      // previously nothing caught that rejection - the button just looked
      // like it did nothing. Surface it instead, in plain language rather
      // than Firebase's raw "Firebase: Error (auth/...)" message.
      const code = (e as { code?: string })?.code;
      if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
        // User closed the popup themselves - not really an error worth showing.
      } else {
        setError(friendlyAuthError(e, 'Google sign-in failed. Please try again.'));
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const openAuth = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
    setEmailErr('');
    setPassErr('');
    setOpen(true);
  };

  return (
    <div className="animate-page-in lp-screen bg-slate-50">
      <header className="lp-header bg-surface border-b border-line">
        <div className="lp-brand">
          <img src="/logo-icon.png" alt="" className="lp-brand-logo" />
          <span className="font-brand text-ink lp-brand-name">
            Aurafin<span className="text-brand-500">.</span>
          </span>
        </div>
        <nav className="lp-nav">
          <button type="button" onClick={() => openAuth('login')} className="btn-press lp-nav-btn lp-nav-outline text-ink">
            Login
          </button>
          <button type="button" onClick={() => openAuth('register')} className="btn-press lp-nav-btn bg-brand-600 hover:bg-brand-700 text-white">
            Sign up
          </button>
        </nav>
      </header>

      <main className="lp-main">
        <LoginShowcase />
      </main>

      <Modal open={open} onClose={() => setOpen(false)} title={mode === 'login' ? 'Welcome back' : 'Create your account'}>
        <div className="login-modal-body">
          <button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="btn-press login-btn login-btn-google flex items-center justify-center gap-[0.6em] font-medium text-ink-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="login-icon" viewBox="0 0 18 18" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.874 2.684-6.616z"
              />
              <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              />
              <path
                fill="#FBBC05"
                d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A9.001 9.001 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z"
              />
              <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.167 6.656 3.58 9 3.58z"
              />
            </svg>
            {googleLoading ? 'Connecting…' : 'Continue with Google'}
          </button>

          {error && <p className="text-[0.875em] text-red-500 mb-[0.75em]">{error}</p>}

          <div className="login-divider flex items-center gap-3">
            <div className="h-px bg-slate-200 flex-1" />
            <span className="text-slate-600">or use email</span>
            <div className="h-px bg-slate-200 flex-1" />
          </div>

          <div className="login-fields">
            <div className={`lf${emailErr ? ' lf-err' : ''}`}>
              <input
                id="login-email"
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
              <label htmlFor="login-email" className="lf-label">Email</label>
              {emailErr && <FieldError message={emailErr} />}
            </div>
            <div className={`lf${passErr ? ' lf-err' : ''}`}>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
              <label htmlFor="login-password" className="lf-label">Password</label>
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
            <button
              onClick={submit}
              className="btn-press login-btn bg-brand-600 hover:bg-brand-700 active:bg-brand-800 text-white font-medium"
            >
              {mode === 'login' ? 'Log In' : 'Sign Up'}
            </button>
          </div>

          <p className="login-switch text-slate-600 text-center">
            {mode === 'login' ? "No account yet? " : 'Already have an account? '}
            <button
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
              className="text-brand-600 font-medium"
            >
              {mode === 'login' ? 'Create one' : 'Log in'}
            </button>
          </p>
        </div>
      </Modal>
    </div>
  );
}
