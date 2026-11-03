import { useState, type ReactNode } from 'react';
import { useAuthStore } from '../store/authStore';
import { friendlyAuthError } from '../utils/authErrors';

type Provider = 'apple' | 'microsoft' | 'yahoo';

const APPLE_PATH =
  'M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701';

const ITEMS: { id: Provider; label: string; icon: ReactNode }[] = [
  {
    id: 'apple',
    label: 'Apple',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="text-ink">
        <path fill="currentColor" d={APPLE_PATH} />
      </svg>
    ),
  },
  {
    id: 'microsoft',
    label: 'Microsoft',
    icon: (
      <svg viewBox="0 0 21 21" width="17" height="17" aria-hidden="true">
        <rect x="1" y="1" width="9" height="9" fill="#f25022" />
        <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
        <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
        <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
      </svg>
    ),
  },
  {
    id: 'yahoo',
    label: 'Yahoo',
    icon: (
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <text x="12" y="18" textAnchor="middle" fontSize="18" fontWeight="800" fontFamily="Arial, sans-serif" fill="#6001d2">
          Y!
        </text>
      </svg>
    ),
  },
];

/** Set to true once Apple, Microsoft and Yahoo are enabled under Firebase
 *  Authentication > Sign-in method. Until then the buttons stay hidden, because
 *  Firebase rejects them with "auth/operation-not-allowed". */
const SHOW_EXTRA_PROVIDERS = false;

/** Apple / Microsoft (Outlook, Hotmail, Live) / Yahoo sign-in, for people whose
 *  email isn't Gmail. Works for both logging in and signing up: a first-time
 *  account is created automatically and goes through onboarding. */
export default function SocialLoginButtons({
  onError,
  disabled,
}: {
  onError: (message: string) => void;
  disabled?: boolean;
}) {
  const loginWithProvider = useAuthStore((s) => s.loginWithProvider);
  const [busy, setBusy] = useState<Provider | null>(null);

  const go = async (id: Provider, label: string) => {
    onError('');
    setBusy(id);
    try {
      await loginWithProvider(id);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        onError(friendlyAuthError(e, `${label} sign-in failed. Please try again.`));
      }
    } finally {
      setBusy(null);
    }
  };

  if (!SHOW_EXTRA_PROVIDERS) return null;

  return (
    <div className="grid grid-cols-3 gap-2 mt-3 mb-1">
      {ITEMS.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => void go(it.id, it.label)}
          disabled={disabled || busy !== null}
          aria-label={`Continue with ${it.label}`}
          className="btn-press flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface text-[13px] font-medium text-ink-2 hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {it.icon}
          <span className="hidden min-[420px]:inline">{busy === it.id ? '…' : it.label}</span>
        </button>
      ))}
    </div>
  );
}
