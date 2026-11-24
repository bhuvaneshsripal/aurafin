import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Mail } from 'lucide-react';
import { Button } from './ui';
import { sendPinResetLink } from '../utils/pinReset';

/** Shown inside the lock screen after "Forgot PIN?": emails a reset link the moment it opens. */
export default function ForgotPinPanel({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<'sending' | 'sent' | 'error'>('sending');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const startedRef = useRef(false);

  const send = useCallback(async () => {
    setError('');
    setState('sending');
    const res = await sendPinResetLink();
    if (res.ok) {
      setMaskedEmail(res.email ?? 'your email');
      setCooldown(res.cooldown ?? 60);
      setState('sent');
    } else {
      setError(res.error ?? 'Could not send the email.');
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    void send();
  }, [send]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  return (
    <div className="w-full max-w-[320px] mx-auto text-center flex flex-col items-center">
      <button
        type="button"
        onClick={onBack}
        className="self-start mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft size={16} /> Back to PIN
      </button>

      <div className="h-14 w-14 rounded-full bg-brand-50 text-brand-600 dark:bg-brand-900/30 inline-flex items-center justify-center mb-4">
        <Mail size={26} />
      </div>

      {state === 'sending' && (
        <>
          <h1 className="text-xl font-semibold text-ink mb-1">Sending email…</h1>
          <p className="text-sm text-muted">Emailing a reset link to your account.</p>
        </>
      )}

      {state === 'sent' && (
        <>
          <h1 className="text-xl font-semibold text-ink mb-1">Check your email</h1>
          <p className="text-sm text-muted mb-6">
            We sent a reset link to <span className="font-medium text-ink-2">{maskedEmail}</span>. Tap <span className="font-medium text-ink-2">Reset PIN</span> in that email to choose a new PIN. The link works for 1 hour. Check spam if you don&apos;t see it.
          </p>
          <button
            type="button"
            disabled={cooldown > 0}
            onClick={() => void send()}
            className="text-sm font-medium text-brand-600 disabled:text-muted disabled:cursor-not-allowed"
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend email'}
          </button>
        </>
      )}

      {state === 'error' && (
        <>
          <h1 className="text-xl font-semibold text-ink mb-1">Could not send email</h1>
          <p role="alert" className="text-sm text-red-500 mb-5">{error}</p>
          <Button onClick={() => void send()}>Try again</Button>
        </>
      )}
    </div>
  );
}
