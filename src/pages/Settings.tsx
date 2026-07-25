import { useState, type ReactNode } from 'react';
import { updateProfile, updatePassword } from 'firebase/auth';
import { Lock, Smartphone, Users, Check } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { auth } from '../firebase/config';
import { CURRENCIES } from '../utils/currency';
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
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  const valid = newPassword.length >= 8 && newPassword === confirmPassword;

  const save = async () => {
    if (!auth.currentUser || !valid) return;
    setStatus('saving');
    setError('');
    try {
      await updatePassword(auth.currentUser, newPassword);
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
          : 'Could not set password. Please try again.'
      );
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Set Password</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        Set a password so you can also sign in with email and password, in addition to Google.
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
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinSet, setPinSet] = useState(() => !!localStorage.getItem('aurafin-pin'));
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
    localStorage.setItem('aurafin-pin', pin);
    setPinSet(true);
    setOpen(false);
    setPin('');
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
      <button
        onClick={() => setOpen(true)}
        className="mt-4 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
      >
        <Lock size={16} />
        {pinSet ? 'Change PIN' : 'Set Up PIN'}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Set Up App Lock">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">4-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
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
    </Card>
  );
}

function InstallAppCard() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useState(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  });

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
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Add Aurafin to your home screen for instant access. Opens like a native app with no browser tabs.
          </p>
        </div>
      </div>

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
        {installed ? 'Installed' : 'Show Install Prompt'}
      </button>
      {!deferredPrompt && !installed && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
          Your browser will show its own install option when available, or use the steps above.
        </p>
      )}
    </Card>
  );
}

function SharedAccessCard() {
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
      <button className="mt-4 w-full flex items-center gap-2 justify-center border border-dashed border-brand-300 dark:border-brand-700 bg-brand-50/50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-brand-50 dark:hover:bg-brand-900/30">
        Upgrade to Pro to share your data with up to 5 people
      </button>
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
