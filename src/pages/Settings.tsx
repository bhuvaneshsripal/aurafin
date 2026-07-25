import { useState, useEffect, type ReactNode } from 'react';
import { updateProfile, updatePassword, linkWithCredential, EmailAuthProvider } from 'firebase/auth';
import { Lock, Smartphone, Users, Check, ShieldCheck, Trash2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAppLockStore } from '../store/appLockStore';
import { auth } from '../firebase/config';
import { CURRENCIES } from '../utils/currency';
import { sendSharedAccessInvite, isInviteEmailConfigured } from '../utils/otp';
import Modal from '../components/Modal';

type Tab = 'account' | 'preferences' | 'profiles' | 'billing' | 'data';

const TABS: { key: Tab; label: string }[] = [
  { key: 'account', label: 'Account' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'billing', label: 'Billing' },
  { key: 'data', label: 'Data' },
];

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      {children}
    </div>
  );
}

function PersonalInfoCard() {
  const user = useAuthStore((s) => s.user);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const save = async () => {
    if (!auth.currentUser) return;
    setStatus('saving');
    try {
      await updateProfile(auth.currentUser, { displayName });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Personal info</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Display Name</label>
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Email</label>
          <input
            value={user?.email ?? ''}
            disabled
            className="w-full border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-500 dark:text-slate-500 rounded-lg px-3 py-2 text-sm cursor-not-allowed"
          />
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Email cannot be changed</p>
        </div>
      </div>
      <button
        onClick={save}
        disabled={status === 'saving'}
        className="mt-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
      >
        {status === 'saving' ? 'Saving...' : status === 'saved' ? 'Saved' : 'Save'}
      </button>
      {status === 'error' && (
        <p className="text-xs text-red-500 mt-2">Something went wrong. Please try again.</p>
      )}
    </Card>
  );
}

function SetPasswordCard() {
  const user = useAuthStore((s) => s.user);
  const hasPasswordProvider = user?.providerData.some((p) => p.providerId === 'password') ?? false;
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const valid = newPassword.length >= 8 && newPassword === confirmPassword;

  const save = async () => {
    if (!auth.currentUser || !auth.currentUser.email || !valid) return;
    setStatus('saving');
    setError('');
    try {
      if (hasPasswordProvider) {
        // Already has a password credential — just change it.
        await updatePassword(auth.currentUser, newPassword);
      } else {
        // Google-only account so far — link an email/password credential so
        // they can also sign in with email + password from now on.
        const credential = EmailAuthProvider.credential(auth.currentUser.email, newPassword);
        await linkWithCredential(auth.currentUser, credential);
      }
      setStatus('saved');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      const code = (err as { code?: string })?.code;
      setError(
        code === 'auth/requires-recent-login'
          ? 'Please sign out and sign in again before changing your password.'
          : code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use'
            ? 'This email is already linked to another sign-in method.'
            : 'Could not set password. Please try again.'
      );
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Set Password</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        {hasPasswordProvider
          ? 'Update the password you use to sign in with email and password.'
          : 'Set a password so you can also sign in with email and password, in addition to Google.'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Min 8 characters"
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>
      </div>
      <button
        onClick={save}
        disabled={!valid || status === 'saving'}
        className="mt-4 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
      >
        {status === 'saving' ? 'Setting...' : status === 'saved' ? 'Password Set' : 'Set Password'}
      </button>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
    </Card>
  );
}

function AppLockCard() {
  const { enabled, setPin, disable } = useAppLockStore();
  const [open, setOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');

  const savePin = () => {
    if (!/^\d{4}$/.test(pin)) {
      setPinError('PIN must be exactly 4 digits.');
      return;
    }
    if (pin !== confirmPin) {
      setPinError('PINs do not match.');
      return;
    }
    setPin(pin);
    setOpen(false);
    setPinInput('');
    setConfirmPin('');
    setPinError('');
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Lock size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">App Lock</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Require a 4-digit PIN to open the app. Locks automatically after 1 minute in the background.
          </p>
        </div>
      </div>

      {enabled && (
        <div className="flex items-center gap-1.5 mt-4">
          <ShieldCheck size={16} className="text-brand-600" />
          <span className="text-sm font-medium text-brand-600">App Lock is enabled</span>
        </div>
      )}

      <div className="flex gap-3 mt-4">
        {enabled ? (
          <>
            <button
              onClick={() => setConfirmDisable(true)}
              className="bg-cream-100 dark:bg-slate-800 border border-cream-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-cream-200 dark:hover:bg-slate-700"
            >
              Disable Lock
            </button>
            <button
              onClick={() => setOpen(true)}
              className="bg-cream-100 dark:bg-slate-800 border border-cream-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-cream-200 dark:hover:bg-slate-700"
            >
              Change PIN
            </button>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            <Lock size={16} />
            Set Up PIN
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Set Up App Lock">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">4-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPinInput(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Confirm PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm tracking-widest focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          {pinError && <p className="text-xs text-red-500">{pinError}</p>}
          <button
            onClick={savePin}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-lg text-sm font-medium"
          >
            Save PIN
          </button>
        </div>
      </Modal>

      <Modal open={confirmDisable} onClose={() => setConfirmDisable(false)} title="Disable App Lock?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Anyone with access to this device will be able to open Aurafin without a PIN.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setConfirmDisable(false)}
              className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                disable();
                setConfirmDisable(false);
              }}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium"
            >
              Disable
            </button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.('(display-mode: standalone)').matches ?? false
  );

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const showPrompt = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Smartphone size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Install App</h2>
          {installed ? (
            <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
              <Check size={13} /> Aurafin is installed as an app on this device
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Add Aurafin to your home screen for instant access. Opens like a native app with no browser
              tabs.
            </p>
          )}
        </div>
      </div>

      {!installed && (
        <>
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                1
              </span>
              Open the browser menu
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                2
              </span>
              Choose <span className="font-medium text-slate-800 dark:text-slate-100">Install app</span> or{' '}
              <span className="font-medium text-slate-800 dark:text-slate-100">Add to Home Screen</span>
            </div>
          </div>

          <button
            onClick={showPrompt}
            disabled={!deferredPrompt}
            className="mt-4 border border-slate-200 dark:border-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Show Install Prompt
          </button>
          {!deferredPrompt && (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
              Your browser will show its own install option when available, or use the steps above.
            </p>
          )}
        </>
      )}
    </Card>
  );
}

interface SharedInvite {
  id: string;
  email: string;
  role: 'view' | 'full';
  status: 'sent' | 'failed';
}

function sharedAccessKey(uid: string | undefined) {
  return `aurafin-shared-access-${uid ?? 'anon'}`;
}

function SharedAccessCard() {
  const user = useAuthStore((s) => s.user);
  const storageKey = sharedAccessKey(user?.uid);
  const [invites, setInvites] = useState<SharedInvite[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    } catch {
      return [];
    }
  });
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'view' | 'full'>('view');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const persist = (next: SharedInvite[]) => {
    setInvites(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const sendInvite = async () => {
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    if (invites.some((i) => i.email.toLowerCase() === email.toLowerCase())) {
      setError('This person already has access.');
      return;
    }

    setSending(true);
    try {
      await sendSharedAccessInvite({
        inviteeEmail: email,
        inviterEmail: user?.email ?? '',
        role,
      });
      persist([...invites, { id: crypto.randomUUID(), email, role, status: 'sent' }]);
      setEmail('');
      setRole('view');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite.');
    } finally {
      setSending(false);
    }
  };

  const removeInvite = (id: string) => {
    persist(invites.filter((i) => i.id !== id));
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Users size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Shared Access</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Share your financial data with trusted people — spouse, financial advisor, CA, or anyone you
            choose. Each person gets View Only or Full Access.
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="their.email@example.com"
          className="flex-1 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as 'view' | 'full')}
          className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="view">View Only</option>
          <option value="full">Full Access</option>
        </select>
        <button
          onClick={sendInvite}
          disabled={sending}
          className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
        >
          {sending ? 'Sending...' : 'Send Invite'}
        </button>
      </div>
      {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
      {!isInviteEmailConfigured() && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Invite emails aren&apos;t configured yet on this deployment (see .env.example).
        </p>
      )}

      {invites.length > 0 && (
        <div className="mt-4 space-y-2">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-sm text-slate-800 dark:text-slate-100">{invite.email}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {invite.role === 'view' ? 'View Only' : 'Full Access'} &middot; Invite emailed
                </p>
              </div>
              <button
                onClick={() => removeInvite(invite.id)}
                className="text-slate-400 hover:text-red-500 p-1"
                aria-label={`Remove ${invite.email}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function PreferencesTab() {
  const [baseCurrency, setBaseCurrency] = useState('INR');
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Base Currency</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        Your net worth and totals will be shown in this currency across the dashboard.
      </p>
      <select
        value={baseCurrency}
        onChange={(e) => setBaseCurrency(e.target.value)}
        className="w-full sm:w-64 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
      >
        {CURRENCIES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </Card>
  );
}

function ProfilesTab() {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Profiles</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Multiple financial profiles (e.g. Personal, Business, Family) are coming soon.
      </p>
    </Card>
  );
}

function BillingTab() {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Current Plan</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">You're on the Free plan.</p>
        </div>
        <Check size={18} className="text-brand-600" />
      </div>
      <button className="mt-4 bg-brand-600 hover:bg-brand-700 text-white px-5 py-2 rounded-lg text-sm font-medium">
        Upgrade to Pro
      </button>
    </Card>
  );
}

function DataTab() {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Data</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Your data is stored in your own Firebase project. Export or delete it any time from the Firebase
        console, or wire up export/delete buttons here later.
      </p>
    </Card>
  );
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>('account');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Account, preferences & privacy</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`w-full text-left px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="space-y-6 min-w-0">
          {tab === 'account' && (
            <>
              <PersonalInfoCard />
              <SetPasswordCard />
              <AppLockCard />
              <InstallAppCard />
              <SharedAccessCard />
            </>
          )}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'profiles' && <ProfilesTab />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'data' && <DataTab />}
        </div>
      </div>
    </div>
  );
}
