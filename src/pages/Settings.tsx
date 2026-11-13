import { useState, useEffect, useRef, Suspense, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';
import {
  updatePassword,
  linkWithCredential,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  EmailAuthProvider,
} from 'firebase/auth';
import { ArrowLeft, ChevronRight, Database, FileText, KeyRound, LockKeyhole, RefreshCw, Share2, SlidersHorizontal, Sparkles, UserRound, Lock, Smartphone, Users, Check, ShieldCheck, Trash2, AlertTriangle, Plus, HelpCircle, Eye, EyeOff, Minus, Type, Maximize, Pencil, Download, Upload, Mail, Bell, Keyboard } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { SHORTCUT_GROUPS } from '../config/shortcuts';
import { useAvatarStore } from '../store/avatarStore';
import { useAvatarUrl } from '../hooks/useAvatarUrl';
import { useDisplayName } from '../hooks/useDisplayName';
import { useAppLockStore } from '../store/appLockStore';
import { useDisplaySettingsStore, FONT_MIN_SCALE, FONT_MAX_SCALE, SCREEN_MIN_SCALE, SCREEN_MAX_SCALE } from '../store/displaySettingsStore';
import { useAlertsStore } from '../store/alertsStore';
import { useGoldSettingsStore } from '../store/goldSettingsStore';
import { pushSupported, sendTestPush, type PushTestResult } from '../hooks/usePushSubscription';
import { useNotificationPreferencesStore, HOLDING_MOVE_OPTIONS, type NotificationChannelKey } from '../store/notificationPreferencesStore';
import InfoTip from '../components/ui/InfoTip';
import PinBoxInput, { type PinBoxInputHandle } from '../components/PinBoxInput';
import { auth } from '../firebase/config';
import CurrencySelect from '../components/CurrencySelect';
import { fetchFxRate } from '../utils/marketPrices';
import { CURRENCY_SYMBOLS } from '../utils/currency';
import { loadImageFromFile } from '../utils/imageResize';
import { formatDateTime } from '../utils/date';
import AvatarCropModal from '../components/AvatarCropModal';
import BasicDetailsCard from '../components/BasicDetailsCard';
import {
  SECURITY_QUESTIONS,
  saveSecurityAnswer,
  getSecurityQuestion,
  verifySecurityAnswer,
} from '../utils/securityQuestion';
import { deleteAllUserData, upsertDoc, removeDoc, saveAvatar, assignOrphanDataToProfile, reassignProfileData, setDefaultProfile, bulkUpsertDocs } from '../hooks/useFirestoreSync';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useGoalsStore } from '../store/goalsStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useBudgetStore } from '../store/budgetStore';
import { useFinancialProfileStore } from '../store/financialProfileStore';
import { buildBackup, downloadBackupJson, readBackupFile, countBackupItems, type AurafinBackup } from '../utils/backup';
import { useHouseholdProfilesStore, PROFILE_COLOURS } from '../store/householdProfilesStore';
import { useInstallPromptStore, triggerInstallPrompt } from '../store/installPromptStore';
import type { HouseholdProfile } from '../types';
import Modal from '../components/Modal';
import { hardRefresh } from '../utils/hardRefresh';
import UpdateDot from '../components/UpdateDot';
import WhatsNewModal, { useWhatsNew } from '../components/WhatsNewModal';
import { isNewVersionDeployed } from '../utils/updateChecks';
import { useUpdateStore } from '../store/updateStore';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useUrlTab } from '../hooks/useUrlTab';
import CustomSelect from '../components/CustomSelect';
import { PageHeader, Button, RequiredMark } from '../components/ui';
import type { ReportSectionKey } from '../components/PortfolioPdfReport';
import { lazyWithRetry } from '../utils/lazyWithRetry';

// Loaded only when the Reports tab is opened: the PDF report pulls in the charts library.
const PortfolioExportModal = lazyWithRetry(() =>
  import('../components/PortfolioExportModal').then((m) => ({ default: m.PortfolioExportModal }))
);
const PortfolioPdfReport = lazyWithRetry(() =>
  import('../components/PortfolioPdfReport').then((m) => ({ default: m.PortfolioPdfReport }))
);
const REPORT_SECTIONS: { key: ReportSectionKey; label: string }[] = [
  { key: 'summary', label: 'Portfolio summary' },
  { key: 'cashflow', label: 'Monthly cashflow' },
  { key: 'breakdown', label: 'Asset breakdown' },
  { key: 'liabilities', label: 'Liabilities' },
  { key: 'holdings', label: 'Current holdings' },
  { key: 'sold', label: 'Sold investments' },
];

type Tab = 'basic' | 'reports' | 'password' | 'pin' | 'shared' | 'preferences' | 'notifications' | 'profiles' | 'data' | 'shortcuts';

const TABS: { key: Tab; label: string }[] = [
  { key: 'basic', label: 'Basic details' },
  { key: 'reports', label: 'Reports' },
  { key: 'password', label: 'Change password' },
  { key: 'pin', label: 'Change Aurafin pincode' },
  { key: 'preferences', label: 'Preferences' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'profiles', label: 'Profiles' },
  { key: 'shared', label: 'Shared access' },
  { key: 'data', label: 'Data' },
  { key: 'shortcuts', label: 'Shortcuts' },
];

const NAV_ICONS: Record<string, LucideIcon> = {
  basic: UserRound,
  reports: FileText,
  password: KeyRound,
  pin: LockKeyhole,
  preferences: SlidersHorizontal,
  notifications: Bell,
  profiles: Users,
  shared: Share2,
  data: Database,
  shortcuts: Keyboard,
};

const NAV_ITEMS = TABS;

function Card({ children }: { children: ReactNode }) {
  return (
    <div className="bg-surface rounded-2xl border border-line p-6 shadow-sm">
      {children}
    </div>
  );
}

/** Profile picture + name at the top of the settings menu. Clicking the picture changes it. */
function ProfileHeader() {
  const user = useAuthStore((s) => s.user);
  const setCustomUrl = useAvatarStore((s) => s.setDataUrl);
  const displayUrl = useAvatarUrl();
  const name = useDisplayName('Your Account');
  const created = user ? ('metadata' in user ? user.metadata?.creationTime : user.createdAt) : undefined;
  const since = (() => {
    const d = created ? new Date(created) : null;
    if (!d || Number.isNaN(d.getTime())) return '';
    const mon = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    return ` SINCE ${mon}'${String(d.getFullYear()).slice(-2)}`;
  })();
  const ringUnit = `AURAFIN${since} • `;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      // Opens the crop/zoom editor; the photo is saved once the person confirms.
      setCropImage(await loadImageFromFile(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
    }
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setCropImage(null);
    if (!user) return;
    setSaving(true);
    setError('');
    try {
      // Show it straight away rather than waiting on the Firestore round-trip.
      setCustomUrl(dataUrl);
      await saveAvatar(user.uid, dataUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your photo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col items-center px-5 pt-4 pb-7">
      <div className="relative h-40 w-40 flex items-center justify-center">
        <svg viewBox="0 0 160 160" className="pointer-events-none absolute inset-0 h-full w-full text-ink-2" aria-hidden>
          <defs>
            <path id="profile-ring" d="M 80,80 m -66,0 a 66,66 0 1,1 132,0 a 66,66 0 1,1 -132,0" />
          </defs>
          <text fill="currentColor" fontSize="10.5" fontWeight="500" letterSpacing="1.5">
            <textPath href="#profile-ring" textLength={2 * Math.PI * 66 - 2} lengthAdjust="spacing">
              {ringUnit.repeat(2)}
            </textPath>
          </text>
        </svg>
        <label className={`relative block rounded-full ${saving ? 'opacity-60' : 'cursor-pointer'}`} aria-label="Change profile photo">
          {displayUrl ? (
            <img src={displayUrl} alt="" className="keep-round h-24 w-24 rounded-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <div className="keep-round h-24 w-24 rounded-full bg-primary-soft text-primary-ink flex items-center justify-center text-3xl font-semibold">
              {name.charAt(0).toUpperCase()}
            </div>
          )}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={saving}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              void handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      <p className="mt-4 text-[16px] font-semibold text-ink text-center break-words max-w-full">{name}</p>
      {error && <p className="text-xs text-red-500 mt-1 text-center">{error}</p>}
      <AvatarCropModal open={!!cropImage} image={cropImage} onCancel={() => setCropImage(null)} onConfirm={handleCropConfirm} />
    </div>
  );
}

function SetPasswordCard() {
  const user = useAuthStore((s) => s.user);
  // `user` may briefly be the cached optimistic profile (uid/email only)
  // right after a refresh, before Firebase confirms the full session and
  // fills in fields like providerData. Fall back to `false` until then -
  // it self-corrects the moment onAuthStateChanged resolves.
  const hasPasswordProvider = (user && 'providerData' in user ? user.providerData : []).some(
    (p) => p.providerId === 'password'
  );

  const [hasSecurityQuestion, setHasSecurityQuestion] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'form' | 'forgot' | 'forgot-sent'>('form');

  const [oldPassword, setOldPassword] = useState('');
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [securityQuestion, setSecurityQuestion] = useState<string>(SECURITY_QUESTIONS[0]);
  const [securityAnswer, setSecurityAnswer] = useState('');

  const [forgotQuestion, setForgotQuestion] = useState('');
  const [forgotAnswer, setForgotAnswer] = useState('');
  const [forgotError, setForgotError] = useState('');
  const [forgotStatus, setForgotStatus] = useState<'idle' | 'checking' | 'sending'>('idle');

  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  // Once a password is already set, check whether a recovery question was
  // saved for it (older accounts may not have one yet) so "Forgot password?"
  // only shows up when it'll actually work.
  useEffect(() => {
    if (!hasPasswordProvider || !user) {
      setHasSecurityQuestion(null);
      return;
    }
    getSecurityQuestion(user.uid)
      .then((q) => setHasSecurityQuestion(!!q))
      .catch(() => setHasSecurityQuestion(false));
  }, [hasPasswordProvider, user]);

  // Firebase itself rejects anything under 6 characters server-side, so the
  // client-side check has to match — otherwise the button looks "eligible"
  // (every field filled in, nothing visibly wrong) but the save silently
  // fails with a generic error once it reaches Firebase.
  const lengthValid = newPassword.length >= 6;
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const oldPasswordOk = hasPasswordProvider ? oldPassword.length > 0 : true;
  const securityAnswerOk = hasPasswordProvider ? true : securityAnswer.trim().length > 0;
  const valid = lengthValid && passwordsMatch && oldPasswordOk && securityAnswerOk;

  const save = async () => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    if (!valid) {
      // Give a specific reason instead of just doing nothing — a disabled
      // button with no explanation reads as broken.
      setError(
        hasPasswordProvider && !oldPasswordOk
          ? 'Enter your current password.'
          : !lengthValid
            ? 'New password must be at least 6 characters.'
            : !passwordsMatch
              ? 'New password and confirmation do not match.'
              : !securityAnswerOk
                ? 'Please answer the security question.'
                : 'Please fill in all fields.'
      );
      return;
    }
    setStatus('saving');
    setError('');
    try {
      if (hasPasswordProvider) {
        // Re-authenticate with the old password first — this both proves
        // it's really them and satisfies Firebase's "recent login" rule
        // for changing a password, instead of forcing a full sign-out.
        const oldCredential = EmailAuthProvider.credential(auth.currentUser.email, oldPassword);
        await reauthenticateWithCredential(auth.currentUser, oldCredential);
        await updatePassword(auth.currentUser, newPassword);
      } else {
        // Google-only account so far — link an email/password credential so
        // they can also sign in with email + password from now on.
        const credential = EmailAuthProvider.credential(auth.currentUser.email, newPassword);
        await linkWithCredential(auth.currentUser, credential);
        await saveSecurityAnswer(auth.currentUser.uid, securityQuestion, securityAnswer);
        setHasSecurityQuestion(true);
      }
      setStatus('saved');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSecurityAnswer('');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      setStatus('error');
      const code = (err as { code?: string })?.code;
      setError(
        code === 'auth/invalid-credential' || code === 'auth/wrong-password'
          ? 'Old password is incorrect.'
          : code === 'auth/requires-recent-login'
            ? 'Please sign out and sign in again before changing your password.'
            : code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use'
              ? 'This email is already linked to another sign-in method.'
              : code === 'auth/weak-password'
                ? 'That password is too weak. Use at least 6 characters.'
                : 'Could not set password. Please try again.'
      );
    }
  };

  const openForgot = async () => {
    if (!user) return;
    setMode('forgot');
    setForgotAnswer('');
    setForgotError('');
    const q = await getSecurityQuestion(user.uid);
    setForgotQuestion(q ?? '');
  };

  const verifyForgotAnswer = async () => {
    if (!user?.email || !forgotAnswer.trim()) return;
    setForgotStatus('checking');
    setForgotError('');
    try {
      const ok = await verifySecurityAnswer(user.uid, forgotAnswer);
      if (!ok) {
        setForgotError("That answer doesn't match. Try again.");
        setForgotStatus('idle');
        return;
      }
      setForgotStatus('sending');
      await sendPasswordResetEmail(auth, user.email);
      setMode('forgot-sent');
    } catch {
      setForgotError('Something went wrong. Please try again.');
    } finally {
      setForgotStatus('idle');
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-1.5">
        Set Password
        <InfoTip>
          {hasPasswordProvider
            ? 'Update the password you use to sign in with email and password. Pick something you don’t use anywhere else.'
            : 'Set a password so you can also sign in with email and password, in addition to Google. Your Google sign-in keeps working.'}
        </InfoTip>
      </h2>

      {mode === 'form' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasPasswordProvider && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-muted mb-1.5">Current Password<RequiredMark /></label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg pl-3 pr-10 py-2 text-sm placeholder:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword((v) => !v)}
                    aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-600 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-muted mb-1.5">New Password<RequiredMark /></label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
                className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm placeholder:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1.5">Confirm New Password<RequiredMark /></label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm placeholder:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            {!hasPasswordProvider && (
              <>
                <div>
                  <label className="block text-xs text-muted mb-1.5">
                    Security Question<RequiredMark />
                  </label>
                  <CustomSelect
                    value={securityQuestion}
                    onChange={setSecurityQuestion}
                    className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    options={SECURITY_QUESTIONS.map((q) => ({ value: q, label: q }))}
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted mb-1.5">Answer<RequiredMark /></label>
                  <input
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Your answer"
                    className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm placeholder:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-muted mt-1.5">
                    Used to recover your password later if you forget it.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-4 mt-4">
            <button
              onClick={save}
              disabled={status === 'saving'}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-medium"
            >
              {status === 'saving' ? 'Setting...' : status === 'saved' ? 'Password Set' : 'Set Password'}
            </button>
            {hasPasswordProvider && hasSecurityQuestion && (
              <button
                onClick={openForgot}
                className="text-xs text-muted font-medium hover:text-brand-600 dark:hover:text-brand-400"
              >
                Forgot your password?
              </button>
            )}
          </div>
          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        </>
      )}

      {mode === 'forgot' && (
        <div className="max-w-sm">
          <div className="flex items-start gap-2 mb-4">
            <HelpCircle size={16} className="text-slate-600 shrink-0 mt-0.5" />
            <p className="text-sm text-ink-2">{forgotQuestion}</p>
          </div>
          <label className="block text-xs text-muted mb-1.5">Your Answer<RequiredMark /></label>
          <input
            value={forgotAnswer}
            onChange={(e) => setForgotAnswer(e.target.value)}
            placeholder="Answer"
            autoFocus
            className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm placeholder:text-slate-600 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {forgotError && <p className="text-xs text-red-500 mt-2">{forgotError}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setMode('form')}
              className="border border-line text-ink-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-hover"
            >
              Back
            </button>
            <button
              onClick={verifyForgotAnswer}
              disabled={!forgotAnswer.trim() || forgotStatus !== 'idle'}
              className="bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {forgotStatus === 'idle' ? 'Verify' : 'Checking...'}
            </button>
          </div>
        </div>
      )}

      {mode === 'forgot-sent' && (
        <div className="max-w-sm">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck size={16} className="text-brand-600" />
            <span className="text-sm font-medium text-brand-600">Reset link sent</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Check <strong>{user?.email}</strong> for a link to set a new password.
          </p>
          <button
            onClick={() => setMode('form')}
            className="mt-4 border border-line text-ink-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Back
          </button>
        </div>
      )}
    </Card>
  );
}

function AppLockCard() {
  const { enabled, setPin, disable, lockNow, verifyPin } = useAppLockStore();
  const [open, setOpen] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [disablePin, setDisablePin] = useState('');
  const [disableError, setDisableError] = useState('');
  const [oldPin, setOldPin] = useState('');
  const [pin, setPinInput] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const confirmPinRef = useRef<PinBoxInputHandle>(null);
  const newPinRef = useRef<PinBoxInputHandle>(null);
  // Changing an existing PIN must prove the current one first.
  const needsOldPin = enabled;

  const openModal = () => {
    setOldPin('');
    setPinInput('');
    setConfirmPin('');
    setPinError('');
    setOpen(true);
  };

  // Jump to the next set of boxes once a 4-digit PIN is complete — done
  // as an effect so it fires after the digit has committed to the DOM,
  // rather than mid-keystroke where the focus call was getting lost.
  useEffect(() => {
    if (pin.length === 4) {
      confirmPinRef.current?.focus();
    }
  }, [pin]);
  useEffect(() => {
    if (needsOldPin && oldPin.length === 4) {
      newPinRef.current?.focus();
    }
  }, [oldPin, needsOldPin]);

  const openDisable = () => {
    setDisablePin('');
    setDisableError('');
    setConfirmDisable(true);
  };
  const closeDisable = () => {
    setConfirmDisable(false);
    setDisablePin('');
    setDisableError('');
  };
  // Turning the lock off must prove the current PIN, same as changing it.
  const confirmDisableLock = () => {
    if (!/^\d{4}$/.test(disablePin)) {
      setDisableError('Enter your current 4-digit PIN.');
      return;
    }
    const res = verifyPin(disablePin);
    if (!res.ok) {
      setDisableError(res.error ?? 'Incorrect current PIN.');
      setDisablePin('');
      return;
    }
    disable();
    closeDisable();
  };

  const savePin = () => {
    if (needsOldPin) {
      if (!/^\d{4}$/.test(oldPin)) {
        setPinError('Enter your current 4-digit PIN.');
        return;
      }
      const res = verifyPin(oldPin);
      if (!res.ok) {
        setPinError(res.error ?? 'Incorrect current PIN.');
        setOldPin('');
        return;
      }
    }
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
    setOldPin('');
    setPinInput('');
    setConfirmPin('');
    setPinError('');
  };

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Lock size={20} className="text-slate-700 dark:text-slate-300 shrink-0" />
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            App Lock
            <InfoTip>
              Protect Aurafin with a 4-digit PIN. The PIN is asked again only after you close the tab or clear the app from recent apps (or tap Lock now), and you are signed out after 3 wrong PIN attempts, so your net worth stays private if someone else picks up your device.
            </InfoTip>
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {enabled ? (
            <>
              <Button onClick={lockNow} leftIcon={<Lock size={16} />}>
                Lock Now
              </Button>
              <Button variant="soft" onClick={openModal}>
                Change PIN
              </Button>
              <Button variant="danger" onClick={openDisable}>
                Disable Lock
              </Button>
            </>
          ) : (
            <button
              onClick={openModal}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Lock size={16} />
              Set Up PIN
            </button>
          )}
        </div>
      </div>

      {enabled && (
        <div className="flex items-center gap-1.5 mt-4">
          <ShieldCheck size={16} className="text-brand-600" />
          <span className="text-sm font-medium text-brand-600">App Lock is enabled</span>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={needsOldPin ? 'Change PIN' : 'Set Up App Lock'}>
        <div className="space-y-4">
          {needsOldPin && (
            <div>
              <label className="block text-xs text-muted mb-2 text-center">Current PIN<RequiredMark /></label>
              <PinBoxInput value={oldPin} onChange={setOldPin} autoFocus />
            </div>
          )}
          <div>
            <label className="block text-xs text-muted mb-2 text-center">{needsOldPin ? 'New 4-digit PIN' : '4-digit PIN'}<RequiredMark /></label>
            <PinBoxInput ref={newPinRef} value={pin} onChange={setPinInput} autoFocus={!needsOldPin} />
          </div>
          <div>
            <label className="block text-xs text-muted mb-2 text-center">{needsOldPin ? 'Confirm new PIN' : 'Confirm PIN'}<RequiredMark /></label>
            <PinBoxInput ref={confirmPinRef} value={confirmPin} onChange={setConfirmPin} />
          </div>
          {pinError && <p className="text-xs text-red-500">{pinError}</p>}
          <button
            onClick={savePin}
            className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors w-full bg-brand-600 hover:bg-brand-700 text-white"
          >
            Save PIN
          </button>
          <p className="text-xs text-muted text-center">
            3 wrong tries signs you out. Log in again to set a new PIN.
          </p>
        </div>
      </Modal>

      <Modal open={confirmDisable} onClose={closeDisable} title="Disable App Lock?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Anyone with access to this device will be able to open <span className="font-luxury">Aurafin</span> without a PIN. Enter your current PIN to turn the lock off.
          </p>
          <div>
            <label className="block text-xs text-muted mb-2 text-center">Current PIN<RequiredMark /></label>
            <PinBoxInput value={disablePin} onChange={setDisablePin} autoFocus />
          </div>
          {disableError && <p className="text-xs text-red-500">{disableError}</p>}
          <div className="flex gap-3">
            <button
              onClick={closeDisable}
              className="flex-1 border border-line text-ink-2 py-2 rounded-lg text-sm font-medium hover:bg-surface-hover"
            >
              Cancel
            </button>
            <button
              onClick={confirmDisableLock}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium"
            >
              Disable
            </button>
          </div>
          <p className="text-xs text-muted text-center">3 wrong tries signs you out.</p>
        </div>
      </Modal>
    </Card>
  );
}

function InstallAppCard() {
  const installed = useInstallPromptStore((s) => s.installed);

  return (
    <Card>
      <div className="flex gap-3">
        <Smartphone size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-ink">Install App</h2>
          {installed ? (
            <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
              <Check size={13} /> <span className="font-luxury">Aurafin</span> is installed as an app on this device
            </p>
          ) : (
            <p className="text-xs text-muted mt-1">
              Add <span className="font-luxury">Aurafin</span> to your home screen for instant access. Opens like a
              native app with no browser tabs.
            </p>
          )}
        </div>
      </div>

      {!installed && (
        <>
          <div className="mt-4 space-y-2.5">
            <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-muted shrink-0">
                1
              </span>
              Open the browser menu
            </div>
            <div className="flex items-center gap-2.5 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 dark:bg-slate-800 text-xs font-medium text-muted shrink-0">
                2
              </span>
              Choose <span className="font-medium text-ink">Install app</span> or{' '}
              <span className="font-medium text-ink">Add to Home Screen</span>
            </div>
          </div>

          <button
            onClick={triggerInstallPrompt}
            className="mt-4 border border-line text-ink-2 px-4 py-2 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Show Install Prompt
          </button>
        </>
      )}
    </Card>
  );
}

function SharedAccessCard() {
  return (
    <Card>
      <div className="flex gap-3">
        <Users size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
              Shared Access
              <InfoTip>
                Share your financial data with up to 5 trusted people — spouse, financial advisor, CA, or anyone you choose. Each person gets View Only or Full Access. This feature is on the way — check back soon.
              </InfoTip>
            </h2>
            <span className="text-xs font-medium text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400 px-2 py-0.5 rounded-full">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col sm:flex-row gap-3 opacity-50 pointer-events-none">
        <input
          type="email"
          disabled
          placeholder="their.email@example.com"
          className="flex-1 border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm placeholder:text-slate-600"
        />
        <CustomSelect
          disabled
          value="view"
          onChange={() => {}}
          options={[{ value: 'view', label: 'View Only' }]}
          className="border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm"
        />
        <button
          disabled
          className="bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap"
        >
          Send Invite
        </button>
      </div>
    </Card>
  );
}

function SizeStepper({
  icon,
  label,
  description,
  value,
  min,
  max,
  onIncrease,
  onDecrease,
  onReset,
}: {
  icon: ReactNode;
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  onIncrease: () => void;
  onDecrease: () => void;
  onReset: () => void;
}) {
  const percent = Math.round(value * 100);
  const atMin = value <= min;
  const atMax = value >= max;
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 border-b last:border-b-0 border-line-soft">
      <div className="flex items-start gap-3 min-w-0">
        <div className="text-muted mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-ink">{label}</h3>
          <p className="text-xs text-muted mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDecrease}
          disabled={atMin}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-line text-slate-600 dark:text-slate-300 hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Minus size={14} />
        </button>
        <button
          type="button"
          onClick={onReset}
          title="Reset to default"
          className="w-12 text-center text-xs font-semibold text-slate-600 dark:text-slate-300 tabular-nums hover:text-brand-600 dark:hover:text-brand-400"
        >
          {percent}%
        </button>
        <button
          type="button"
          onClick={onIncrease}
          disabled={atMax}
          aria-label={`Increase ${label.toLowerCase()}`}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-line text-slate-600 dark:text-slate-300 hover:bg-surface-hover disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

function DisplaySizeCard() {
  const {
    fontScale,
    screenScale,
    increaseFont,
    decreaseFont,
    resetFont,
    increaseScreen,
    decreaseScreen,
    resetScreen,
  } = useDisplaySettingsStore();

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink mb-1">Display Size</h2>
      <p className="text-xs text-muted mb-2">
        Tap <strong>−</strong> or <strong>+</strong> to adjust. Tap the percentage to reset it.
      </p>
      <div>
        <SizeStepper
          icon={<Type size={18} />}
          label="Font Size"
          description="Text size across the whole app."
          value={fontScale}
          min={FONT_MIN_SCALE}
          max={FONT_MAX_SCALE}
          onIncrease={increaseFont}
          onDecrease={decreaseFont}
          onReset={resetFont}
        />
        <SizeStepper
          icon={<Maximize size={18} />}
          label="Screen Size"
          description="Zoom level of the page content."
          value={screenScale}
          min={SCREEN_MIN_SCALE}
          max={SCREEN_MAX_SCALE}
          onIncrease={increaseScreen}
          onDecrease={decreaseScreen}
          onReset={resetScreen}
        />
      </div>
    </Card>
  );
}

function FloatingEyeCard() {
  const on = useDisplaySettingsStore((s) => s.floatingEye);
  const setOn = useDisplaySettingsStore((s) => s.setFloatingEye);
  const pos = useDisplaySettingsStore((s) => s.eyePos);
  const setPos = useDisplaySettingsStore((s) => s.setEyePos);
  return (
    <Card>
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-1.5">
            Floating eye button
            <InfoTip>
              A second show/hide-amounts eye on the screen. Press and hold it, then drag to move it
              anywhere. Turn off to hide it.
            </InfoTip>
          </h2>
        </div>
        <Toggle checked={on} onChange={() => setOn(!on)} label="Show floating eye button" />
      </div>
      {on && pos && (
        <button
          type="button"
          onClick={() => setPos(null)}
          className="mt-3 text-xs font-medium text-brand-600 hover:underline"
        >
          Reset position
        </button>
      )}
    </Card>
  );
}

function GoldRateCard() {
  const premiumPercent = useGoldSettingsStore((s) => s.premiumPercent);
  const setPremiumPercent = useGoldSettingsStore((s) => s.setPremiumPercent);
  // Local draft so typing "1" then "2" for "12" doesn't briefly commit "1".
  const [draft, setDraft] = useState(String(premiumPercent));

  useEffect(() => {
    setDraft(String(premiumPercent));
  }, [premiumPercent]);

  const commit = () => {
    const parsed = Number(draft);
    if (Number.isFinite(parsed)) {
      const clamped = Math.min(30, Math.max(-10, parsed));
      setPremiumPercent(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(premiumPercent));
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-1.5">
        Gold Rate Calibration
        <InfoTip>
          The live gold rate is derived from a global spot price, which typically reads lower than
          Indian retail/bullion rates (import duty, GST, dealer margin). Compare the "Live Gold
          Price" card on your Dashboard against a source you trust — like Goodreturns or your local
          jeweller — and adjust this until they match.
        </InfoTip>
      </h2>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.1"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          className="w-24 border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <span className="text-sm text-muted">% added on top of the raw spot-derived rate</span>
      </div>
    </Card>
  );
}

/** iOS-style pill toggle switch — used by the Notifications card below.
 *  A plain button (not a checkbox) so it's trivially keyboard- and
 *  screen-reader-accessible via role="switch"/aria-checked without extra
 *  wiring. */
function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 ${
        checked ? 'bg-brand-600' : 'bg-slate-300 dark:bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

type NotificationChannel = { key: NotificationChannelKey; label: string; icon: typeof Mail };

// Weekly digest and budget alerts are the only notification types the
// free plan sends — no subscription/recurring-payment reminders since
// this app has no billing to remind anyone about.
const NOTIFICATION_ROWS: { title: string; channels: NotificationChannel[] }[] = [
  {
    title: 'Weekly portfolio digest',
    channels: [{ key: 'weeklyDigestEmail', label: 'Email', icon: Mail }],
  },
  {
    title: 'Budget alerts',
    channels: [{ key: 'budgetAlertsInApp', label: 'In-app', icon: Bell }],
  },
];

/** Lets the person check that alerts reach this phone even when the app is closed. */
function ClosedAppAlertsCard() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PushTestResult | null>(null);
  const supported = pushSupported();

  const run = async () => {
    setBusy(true);
    setResult(await sendTestPush());
    setBusy(false);
  };

  let message: string | null = null;
  if (result) {
    if (result.server && (!result.server.vapid || !result.server.serviceAccount)) message = 'Server push keys missing.';
    else if (result.error) message = `Could not send: ${result.error}`;
    else if (result.devices === 0) message = 'No device registered.';
    else if (result.sent === 0) message = 'Push was rejected.';
    else message = `Sent to ${result.sent} device${result.sent === 1 ? '' : 's'}.`;
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold text-ink mb-4">Alerts when the app is closed</h2>
      <button
        type="button"
        onClick={run}
        disabled={busy || !supported}
        className="btn-press inline-flex items-center justify-center gap-2 rounded-xl border border-line px-4 h-10 text-sm font-medium text-ink disabled:opacity-60"
      >
        <Bell size={14} />
        {busy ? 'Sending…' : 'Send a test notification'}
      </button>
      {message && <p className="text-xs text-muted mt-3">{message}</p>}
    </Card>
  );
}

function NotificationsCard() {
  const prefs = useNotificationPreferencesStore((s) => s.prefs);
  const toggle = useNotificationPreferencesStore((s) => s.toggle);

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-sm font-semibold text-ink">Notifications</h2>
        <span className="text-xs font-medium text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400 px-2 py-0.5 rounded-full">
          Coming Soon
        </span>
      </div>
      <div className="space-y-2">
        {NOTIFICATION_ROWS.map((row) => (
          <div
            key={row.title}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-slate-50 dark:bg-slate-800/40 px-4 py-3 opacity-60"
          >
            <span className="text-sm font-medium text-ink">{row.title}</span>
            <div className="flex items-center gap-5">
              {row.channels.map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex items-center gap-2">
                  <Icon size={14} className="text-muted" />
                  <span className="text-xs text-muted">{label}</span>
                  <Toggle
                    checked={prefs[key]}
                    onChange={() => toggle(key)}
                    label={`${label} notifications for ${row.title}`}
                    disabled
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

    </Card>
  );
}

/** One labelled row with a toggle, used by the Advanced card. */
function AdvancedRow({ title, hint, checked, onChange }: { title: string; hint?: string; checked: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-ink">{title}</p>
        {hint && <p className="text-xs text-muted mt-0.5">{hint}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

/** Advanced notification controls: what is sent, how sensitive it is, and when it stays quiet. */
function AdvancedNotificationsCard() {
  const adv = useNotificationPreferencesStore((s) => s.advanced);
  const setAdvanced = useNotificationPreferencesStore((s) => s.setAdvanced);
  const marketAlerts = useAlertsStore((s) => s.enabled);
  const setMarketAlerts = useAlertsStore((s) => s.setEnabled);
  const timeCls = 'border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50';

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={15} className="text-brand-600" />
        <h2 className="text-sm font-semibold text-ink">Advanced notifications</h2>
      </div>

      <div className="space-y-2">
        <AdvancedRow
          title="Market & price alerts"
          checked={marketAlerts}
          onChange={() => setMarketAlerts(!marketAlerts)}
        />
      </div>

      <fieldset disabled={!marketAlerts} className={`mt-5 space-y-5 ${marketAlerts ? '' : 'opacity-50'}`}>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Daily market summaries</h3>
          <div className="space-y-2">
            <AdvancedRow title="Pre-market (9:00 AM)" checked={adv.sessionPreOpen} onChange={() => setAdvanced({ sessionPreOpen: !adv.sessionPreOpen })} />
            <AdvancedRow title="Market open (9:15 AM)" checked={adv.sessionOpen} onChange={() => setAdvanced({ sessionOpen: !adv.sessionOpen })} />
            <AdvancedRow title="Market close (3:30 PM)" checked={adv.sessionClose} onChange={() => setAdvanced({ sessionClose: !adv.sessionClose })} />
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Price-move alerts</h3>
          <div className="space-y-2">
            <AdvancedRow title="Index moves" checked={adv.indexMoves} onChange={() => setAdvanced({ indexMoves: !adv.indexMoves })} />
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">Holding move threshold</p>
              </div>
              <div className="flex gap-1" role="group" aria-label="Holding move thresholds">
                {HOLDING_MOVE_OPTIONS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={adv.holdingMoveLevels.includes(n)}
                    onClick={() => {
                      const has = adv.holdingMoveLevels.includes(n);
                      // Keep at least one level selected.
                      if (has && adv.holdingMoveLevels.length === 1) return;
                      const next = has ? adv.holdingMoveLevels.filter((l) => l !== n) : [...adv.holdingMoveLevels, n].sort((a, b) => a - b);
                      setAdvanced({ holdingMoveLevels: next });
                    }}
                    className={`h-9 min-w-[3rem] rounded-lg px-3 text-sm font-medium border transition-colors ${
                      adv.holdingMoveLevels.includes(n) ? 'bg-brand-600 border-brand-600 text-white' : 'border-line text-ink hover:bg-surface-hover'
                    }`}
                  >
                    {n}%
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Quiet hours (IST)</h3>
          <AdvancedRow
            title="Silence phone pop-ups"
            checked={adv.quietHoursEnabled}
            onChange={() => setAdvanced({ quietHoursEnabled: !adv.quietHoursEnabled })}
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-muted">
              From
              <input type="time" value={adv.quietStart} disabled={!adv.quietHoursEnabled} onChange={(e) => e.target.value && setAdvanced({ quietStart: e.target.value })} className={timeCls} />
            </label>
            <label className="flex items-center gap-2 text-xs text-muted">
              To
              <input type="time" value={adv.quietEnd} disabled={!adv.quietHoursEnabled} onChange={(e) => e.target.value && setAdvanced({ quietEnd: e.target.value })} className={timeCls} />
            </label>
          </div>
        </div>
      </fieldset>
    </Card>
  );
}

function NotificationsTab() {
  return (
    <>
      <NotificationsCard />
      <ClosedAppAlertsCard />
      <AdvancedNotificationsCard />
    </>
  );
}

/** Reports: pick what goes in the PDF, preview it, then download. */
function ReportsTab() {
  const [sections, setSections] = useState<ReportSectionKey[]>(REPORT_SECTIONS.map((x) => x.key));
  const [preview, setPreview] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [innerH, setInnerH] = useState(0);
  const PAGE = 900;

  useEffect(() => {
    if (!preview || !wrapRef.current) return;
    const el = wrapRef.current;
    const update = () => {
      setScale(Math.min(1, el.clientWidth / PAGE));
      setInnerH(innerRef.current?.offsetHeight ?? 0);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (innerRef.current) ro.observe(innerRef.current);
    return () => ro.disconnect();
  }, [preview]);

  const toggleSection = (k: ReportSectionKey) =>
    setSections((cur) => {
      if (cur.includes(k)) return cur.length === 1 ? cur : cur.filter((x) => x !== k);
      return REPORT_SECTIONS.map((x) => x.key).filter((x) => x === k || cur.includes(x));
    });
  const allSelected = sections.length === REPORT_SECTIONS.length;

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-sm font-semibold text-ink">Portfolio report</h2>
          <button
            type="button"
            onClick={() => setSections(allSelected ? [sections[0]] : REPORT_SECTIONS.map((x) => x.key))}
            className="text-xs font-medium text-brand-600 hover:underline"
          >
            {allSelected ? 'Clear' : 'Select all'}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {REPORT_SECTIONS.map(({ key, label }) => {
            const on = sections.includes(key);
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => toggleSection(key)}
                className={`inline-flex items-center justify-center sm:justify-start gap-1.5 h-10 sm:h-9 rounded-lg px-3 text-sm font-medium border transition-all duration-200 ${
                  on
                    ? 'border-brand-500 text-brand-700 bg-transparent shadow-[0_0_0_1px_rgba(47,133,88,0.35),0_0_12px_2px_rgba(47,133,88,0.35)]'
                    : 'border-line text-ink hover:bg-surface-hover'
                }`}
              >
                {on && <Check size={14} />}
                {label}
              </button>
            );
          })}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
          <button
            type="button"
            onClick={() => setPreview((v) => !v)}
            className="btn-press inline-flex items-center gap-2 rounded-xl border border-line px-4 h-10 text-sm font-medium text-ink"
          >
            {preview ? <EyeOff size={14} /> : <Eye size={14} />}
            {preview ? 'Hide preview' : 'Preview'}
          </button>
          <button
            type="button"
            onClick={() => setDownloading(true)}
            disabled={downloading}
            className="btn-press inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 h-10 text-sm font-medium text-white disabled:opacity-60"
          >
            <Download size={14} />
            {downloading ? 'Preparing…' : 'Download PDF'}
          </button>
        </div>
      </Card>

      {preview && (
        <Card>
          <div ref={wrapRef} className="w-full overflow-hidden rounded-lg border border-line bg-white" style={{ height: innerH ? innerH * scale : undefined }}>
            <Suspense fallback={<p className="p-6 text-sm text-muted">Loading preview…</p>}>
              <div ref={innerRef} style={{ width: PAGE, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
                <PortfolioPdfReport reportElementId="portfolio-pdf-report-preview" sections={sections} />
              </div>
            </Suspense>
          </div>
        </Card>
      )}

      {downloading && (
        <Suspense fallback={null}>
          <PortfolioExportModal open={downloading} sections={sections} onClose={() => setDownloading(false)} />
        </Suspense>
      )}
    </>
  );
}

/** Live "1 <compare> = <base><X>" line for the chosen pair of currencies. */
function FxVsDollar({ base, compare }: { base: string; compare: string }) {
  const [rate, setRate] = useState<number | null | undefined>(undefined); // undefined = loading
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRate(undefined);
    fetchFxRate(compare, base).then((r) => {
      if (cancelled) return;
      setRate(r);
      setAsOf(r ? new Date() : null);
    });
    return () => {
      cancelled = true;
    };
  }, [base, compare, tick]);

  const sym = CURRENCY_SYMBOLS[base] ?? base;
  const fmt = (n: number, d: number) => n.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1">
      {rate === undefined ? (
        <p className="text-sm text-muted">Fetching live rate…</p>
      ) : rate === null ? (
        <p className="text-sm text-negative">Couldn't fetch the live rate. Try again.</p>
      ) : (
        <>
          <p className="text-base font-semibold text-ink">
            1 {compare} = {sym}{fmt(rate, 2)}
          </p>
          {asOf && (
            <span className="text-xs text-muted">
              Updated {asOf.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </>
      )}
      <button
        type="button"
        onClick={() => setTick((t) => t + 1)}
        aria-label="Refresh exchange rate"
        className="p-1 rounded-md text-muted hover:text-ink hover:bg-surface-hover transition-colors"
      >
        <RefreshCw size={14} className={rate === undefined ? 'animate-spin' : ''} />
      </button>
    </div>
  );
}

function PreferencesTab() {
  const [baseCurrency, setBaseCurrency] = useState('INR');
  const [compareCurrency, setCompareCurrency] = useState('USD');
  return (
    <>
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Base Currency</h2>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:max-w-xl">
          <div className="min-w-0">
            <label className="block text-xs font-medium text-muted mb-1.5">Base currency</label>
            <CurrencySelect value={baseCurrency} onChange={setBaseCurrency} className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <div className="min-w-0">
            <label className="block text-xs font-medium text-muted mb-1.5">Compare with</label>
            <CurrencySelect value={compareCurrency} onChange={setCompareCurrency} className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
        </div>
        <FxVsDollar base={baseCurrency} compare={compareCurrency} />
      </Card>
      <GoldRateCard />
      <DisplaySizeCard />
      {/* Laptop: the eye is pinned bottom-right, so there's nothing to configure. */}
      <div className="md:hidden">
        <FloatingEyeCard />
      </div>
      <InstallAppCard />
    </>
  );
}

function ProfilesTab() {
  const user = useAuthStore((s) => s.user);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const setActiveProfileId = useHouseholdProfilesStore((s) => s.setActiveProfileId);

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [colour, setColour] = useState(PROFILE_COLOURS[0]);

  // When there are no profiles yet, this is the very first one — default the
  // name field to the account owner's own name instead of leaving it blank.
  const openAdd = () => {
    if (profiles.length === 0) {
      setName(user?.displayName?.trim() || '');
    }
    setAddOpen(true);
  };

  const [editingProfile, setEditingProfile] = useState<HouseholdProfile | null>(null);
  const [editName, setEditName] = useState('');
  const [editColour, setEditColour] = useState(PROFILE_COLOURS[0]);

  // The "default" profile is whichever one the app opens to. Falls back to
  // the first profile in the list if none has been explicitly set yet.
  const defaultProfileId = activeProfileId ?? profiles[0]?.id ?? null;

  const maxProfiles = 5;
  const canAddMore = profiles.length < maxProfiles;

  // Data created before profiles existed (or before a 2nd profile was
  // added) has no profileId, so it doesn't show up under any specific
  // profile — only in the combined "All Profiles" view. Let the person
  // explicitly claim it for one profile rather than guessing.
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allGoals = useGoalsStore((s) => s.goals);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const orphanCount =
    allAssets.filter((a) => !a.profileId).length +
    allLiabilities.filter((l) => !l.profileId).length +
    allGoals.filter((g) => !g.profileId).length +
    allTransactions.filter((t) => !t.profileId).length;
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const handleClaimOrphanData = async (profileId: string) => {
    if (!user) return;
    setClaimingId(profileId);
    try {
      await assignOrphanDataToProfile(user, 'assets', allAssets, profileId);
      await assignOrphanDataToProfile(user, 'liabilities', allLiabilities, profileId);
      await assignOrphanDataToProfile(user, 'goals', allGoals, profileId);
      await assignOrphanDataToProfile(user, 'transactions', allTransactions, profileId);
    } finally {
      setClaimingId(null);
    }
  };

  const countForProfile = (profileId: string) =>
    allAssets.filter((a) => a.profileId === profileId).length +
    allLiabilities.filter((l) => l.profileId === profileId).length +
    allGoals.filter((g) => g.profileId === profileId).length +
    allTransactions.filter((t) => t.profileId === profileId).length;

  const [moveMenuFor, setMoveMenuFor] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);

  const handleMoveData = async (fromProfileId: string, toProfileId: string) => {
    if (!user) return;
    setMoveMenuFor(null);
    setMovingId(fromProfileId);
    try {
      await reassignProfileData(user, 'assets', allAssets, fromProfileId, toProfileId);
      await reassignProfileData(user, 'liabilities', allLiabilities, fromProfileId, toProfileId);
      await reassignProfileData(user, 'goals', allGoals, fromProfileId, toProfileId);
      await reassignProfileData(user, 'transactions', allTransactions, fromProfileId, toProfileId);
    } finally {
      setMovingId(null);
    }
  };

  const handleAdd = async () => {
    if (!user || !name.trim()) return;
    const isFirstProfile = profiles.length === 0;
    const profile: HouseholdProfile = {
      id: crypto.randomUUID(),
      name: name.trim(),
      colour,
      createdAt: Date.now(),
      isDefault: isFirstProfile,
    };
    await upsertDoc(user, 'profiles', profile);
    // Only the very first profile ever created should auto-become active/
    // default. Later ones must be set default explicitly — adding a 2nd,
    // 3rd, etc. profile should never silently bump the current default.
    if (isFirstProfile) setActiveProfileId(profile.id);
    setAddOpen(false);
    setName('');
    setColour(PROFILE_COLOURS[0]);
  };

  const openEdit = (p: HouseholdProfile) => {
    setEditingProfile(p);
    setEditName(p.name);
    setEditColour(p.colour);
  };

  const handleSaveEdit = async () => {
    if (!user || !editingProfile || !editName.trim()) return;
    const updated: HouseholdProfile = { ...editingProfile, name: editName.trim(), colour: editColour };
    await upsertDoc(user, 'profiles', updated);
    setEditingProfile(null);
  };

  const handleSetDefault = async (id: string) => {
    setActiveProfileId(id);
    if (!user) return;
    // Persisted account-wide (not just this device), so any other device
    // signing into this account opens straight to this profile too.
    await setDefaultProfile(user, profiles.map((p) => p.id), id);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await removeDoc(user, 'profiles', id);
    if (activeProfileId === id) {
      const remaining = profiles.filter((p) => p.id !== id);
      setActiveProfileId(remaining[0]?.id ?? null);
    }
  };

  const [pendingDeleteProfile, setPendingDeleteProfile] = useState<HouseholdProfile | null>(null);
  const confirmDeleteProfile = async () => {
    if (!pendingDeleteProfile) return;
    await handleDelete(pendingDeleteProfile.id);
    setPendingDeleteProfile(null);
  };

  return (
    <>
      <Card>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-ink">Family Profiles</h2>
          </div>
          <Users size={16} className="text-slate-600" />
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
          Manage your profiles. Each profile has its own assets, liabilities, transactions, and goals.{' '}
          {profiles.length}/{maxProfiles} profiles
        </p>

        {orphanCount > 0 && (
          <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3 mb-4">
            <AlertTriangle size={15} className="text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              {orphanCount} item{orphanCount === 1 ? '' : 's'} of your data isn't assigned to any profile yet, so it
              only shows up in "All Profiles", not under a specific one. Use "Claim this data" on the profile it
              belongs to below.
            </p>
          </div>
        )}

        <div className="space-y-2 mb-4">
          {profiles.map((p) => {
            const isDefault = p.id === defaultProfileId;
            const itemCount = countForProfile(p.id);
            const otherProfiles = profiles.filter((other) => other.id !== p.id);
            return (
              <div
                key={p.id}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-line"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.colour }}
                  />
                  <span className="text-sm font-medium text-ink">{p.name}</span>
                  {isDefault && (
                    <span className="text-xs font-medium text-muted bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                      Default
                    </span>
                  )}
                  <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {itemCount} item{itemCount === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="flex items-center gap-3 relative">
                  <button
                    onClick={() => openEdit(p)}
                    className="text-slate-300 dark:text-slate-600 hover:text-brand-600"
                    aria-label={`Edit ${p.name}`}
                  >
                    <Pencil size={15} />
                  </button>
                  {orphanCount > 0 && (
                    <button
                      onClick={() => handleClaimOrphanData(p.id)}
                      disabled={claimingId === p.id}
                      className="text-xs font-medium text-amber-600 dark:text-amber-400 hover:text-amber-700 disabled:opacity-50"
                    >
                      {claimingId === p.id ? 'Claiming…' : 'Claim this data'}
                    </button>
                  )}
                  {itemCount > 0 && otherProfiles.length > 0 && (
                    <div className="relative">
                      <button
                        onClick={() => setMoveMenuFor(moveMenuFor === p.id ? null : p.id)}
                        disabled={movingId === p.id}
                        className="text-xs font-semibold text-ink-2 hover:text-brand-600 dark:hover:text-brand-300 disabled:opacity-50"
                      >
                        {movingId === p.id ? 'Moving…' : 'Move data to…'}
                      </button>
                      {moveMenuFor === p.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-line rounded-lg shadow-lg py-1 min-w-[140px]">
                          {otherProfiles.map((target) => (
                            <button
                              key={target.id}
                              onClick={() => handleMoveData(p.id, target.id)}
                              className="w-full text-left px-3 py-2 text-xs text-ink-2 hover:bg-slate-50 dark:hover:bg-slate-700"
                            >
                              {target.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => handleSetDefault(p.id)}
                      className="text-xs font-semibold text-ink-2 hover:text-brand-600 dark:hover:text-brand-300"
                    >
                      Set default
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => setPendingDeleteProfile(p)}
                      className="text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300"
                      aria-label={`Delete ${p.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canAddMore ? (
          <button
            onClick={openAdd}
            className="flex items-center gap-2 text-brand-600 dark:text-brand-300 hover:text-brand-700 text-sm font-medium"
          >
            <Plus size={16} /> Add Profile
          </button>
        ) : (
          <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 border border-line rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-600" />
              <p className="text-xs text-slate-600 dark:text-slate-300">
                You've reached the {maxProfiles}-profile limit for a single account.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Profile">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted mb-1.5 block">Name<RequiredMark /></span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dad, Mom, Priya"
              className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div>
            <span className="text-xs font-medium text-muted mb-1.5 block">Colour</span>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLOURS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColour(c)}
                  className={`w-8 h-8 rounded-full ${colour === c ? 'ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleAdd}
            disabled={!name.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Save Profile
          </button>
        </div>
      </Modal>

      <Modal open={!!editingProfile} onClose={() => setEditingProfile(null)} title="Edit Profile">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-muted mb-1.5 block">Name<RequiredMark /></span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Dad, Mom, Priya"
              className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div>
            <span className="text-xs font-medium text-muted mb-1.5 block">Colour</span>
            <div className="flex flex-wrap gap-2">
              {PROFILE_COLOURS.map((c) => (
                <button
                  key={c}
                  onClick={() => setEditColour(c)}
                  className={`w-8 h-8 rounded-full ${editColour === c ? 'ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-slate-900' : ''}`}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>
          <button
            onClick={handleSaveEdit}
            disabled={!editName.trim()}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            Save Changes
          </button>
        </div>
      </Modal>

      <ConfirmDeleteModal
        open={!!pendingDeleteProfile}
        onClose={() => setPendingDeleteProfile(null)}
        onConfirm={confirmDeleteProfile}
        title="Delete this profile?"
        description={
          <>
            This will permanently delete the <strong>{pendingDeleteProfile?.name}</strong> profile. Data already
            assigned to it will remain but become unassigned. This can't be undone.
          </>
        }
      />
    </>
  );
}

/** Settings > Shortcuts: the keyboard shortcuts the app understands. */
function ShortcutsTab() {
  return (
    <div className="space-y-6">
      {SHORTCUT_GROUPS.map((group) => (
        <Card key={group.title}>
          <h2 className="text-sm font-semibold text-ink mb-1">{group.title}</h2>
          <ul className="divide-y divide-line-soft">
            {group.items.map((it) => (
              <li key={it.label} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{it.label}</p>
                  <p className="text-xs text-muted mt-0.5">{it.description}</p>
                </div>
                <div className="shrink-0 flex items-center gap-1.5">
                  {it.keys.map((k, i) => (
                    <span key={k} className="inline-flex items-center gap-1.5">
                      {i > 0 && <span className="text-xs text-faint">+</span>}
                      <kbd className="min-w-[2rem] rounded-lg border border-line border-b-2 bg-surface-muted px-2.5 py-1 text-center font-sans text-[13px] font-semibold text-ink-2">
                        {k}
                      </kbd>
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}
      <div className="flex items-center gap-1.5 px-1 text-xs text-muted">
        <InfoTip size={16} label="About keyboard shortcuts">
          Shortcuts work on a computer with a keyboard. On a Mac, use Cmd in place of Ctrl (Cmd+Q is kept by the
          browser, so Settings has no shortcut there). Ctrl+A and Alt+N are ignored while you are typing in a box, and
          no shortcut fires while a dialog is open.
        </InfoTip>
        <span>About shortcuts</span>
      </div>
    </div>
  );
}

function DataTab() {
  const user = useAuthStore((s) => s.user);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [status, setStatus] = useState<'idle' | 'deleting' | 'error'>('idle');

  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const goals = useGoalsStore((s) => s.goals);
  const transactions = useTransactionsStore((s) => s.transactions);
  const snapshots = useSnapshotsStore((s) => s.snapshots);
  const budgets = useBudgetStore((s) => s.items);
  const financialProfile = useFinancialProfileStore((s) => s.profile);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);

  const [pendingRestore, setPendingRestore] = useState<AurafinBackup | null>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'restoring' | 'done'>('idle');

  const closeModal = () => {
    setConfirmOpen(false);
    setConfirmText('');
    setStatus('idle');
  };

  const handleDeleteAll = async () => {
    if (!user || confirmText !== 'DELETE') return;
    setStatus('deleting');
    try {
      await deleteAllUserData(user);
      closeModal();
    } catch {
      setStatus('error');
    }
  };

  const handleDownloadBackup = () => {
    const backup = buildBackup({
      assets,
      liabilities,
      goals,
      transactions,
      snapshots,
      budgets,
      financialProfile,
      profiles,
    });
    downloadBackupJson(backup);
  };

  const handlePickBackupFile = async (file: File | null) => {
    if (!file) return;
    setRestoreError('');
    try {
      const backup = await readBackupFile(file);
      setPendingRestore(backup);
    } catch (err) {
      setRestoreError(err instanceof Error ? err.message : "Couldn't read that file.");
    }
  };

  const closeRestoreModal = () => {
    setPendingRestore(null);
    setRestoreStatus('idle');
    setRestoreError('');
  };

  const handleConfirmRestore = async () => {
    if (!user || !pendingRestore) return;
    setRestoreStatus('restoring');
    try {
      const { data } = pendingRestore;
      if (data.assets?.length) await bulkUpsertDocs(user, 'assets', data.assets);
      if (data.liabilities?.length) await bulkUpsertDocs(user, 'liabilities', data.liabilities);
      if (data.goals?.length) await bulkUpsertDocs(user, 'goals', data.goals);
      if (data.transactions?.length) await bulkUpsertDocs(user, 'transactions', data.transactions);
      if (data.snapshots?.length) await bulkUpsertDocs(user, 'snapshots', data.snapshots);
      if (data.budgets?.length) await bulkUpsertDocs(user, 'budgets', data.budgets);
      if (data.profiles?.length) await bulkUpsertDocs(user, 'profiles', data.profiles);
      if (data.financialProfile?.[0]) await upsertDoc(user, 'financialProfile', data.financialProfile[0]);
      setRestoreStatus('done');
    } catch {
      setRestoreError('Something went wrong while restoring. Please try again.');
      setRestoreStatus('idle');
    }
  };

  return (
    <>
      <Card>
        <h2 className="text-sm font-semibold text-ink mb-1">Backup</h2>
        <p className="text-xs text-muted mb-4">
          Keep a backup file of your account that comes in handy when switching devices.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink">Download backup</h3>
            <button
              onClick={handleDownloadBackup}
              className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors mt-3 bg-brand-600 hover:bg-brand-700 text-white"
            >
              <Download size={16} />
              Download Backup
            </button>
          </div>

          <div className="flex-1 border border-line rounded-xl p-4">
            <h3 className="text-sm font-semibold text-ink">Restore from backup</h3>
            <label className="mt-3 inline-flex items-center gap-2 border border-line text-ink-2 hover:bg-surface-hover px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
              <Upload size={16} />
              Choose Backup File
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  handlePickBackupFile(file);
                  e.target.value = '';
                }}
              />
            </label>
            {restoreError && !pendingRestore && <p className="text-xs text-red-500 mt-2">{restoreError}</p>}
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="text-sm font-semibold text-ink mb-4">Data</h2>

        <div className="flex gap-3 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded-xl p-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Delete all data</h3>
            <p className="text-xs text-muted mt-1">
              Permanently removes everything in your account. This cannot be undone.
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className="mt-3 flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Trash2 size={16} />
              Delete All Data
            </button>
          </div>
        </div>
      </Card>

      <Modal open={!!pendingRestore} onClose={closeRestoreModal} title="Restore this backup?">
        {pendingRestore && (
          <>
            <p className="text-sm text-muted mb-4">
              This backup was made on <strong>{formatDateTime(pendingRestore.exportedAt)}</strong> and
              contains <strong>{countBackupItems(pendingRestore)}</strong> item{countBackupItems(pendingRestore) === 1 ? '' : 's'}.
              They'll be added into <strong>{user?.email}</strong> — anything already in your account stays as is,
              and items with the same ID as ones already in your account will be overwritten with the backup's version.
            </p>
            {restoreError && <p className="text-xs text-red-500 mb-4">{restoreError}</p>}
            {restoreStatus === 'done' ? (
              <div className="flex gap-3">
                <button
                  onClick={closeRestoreModal}
                  className="inline-flex items-center justify-center gap-2 h-10 sm:h-9 px-4 text-sm font-medium rounded-lg transition-colors flex-1 bg-brand-600 hover:bg-brand-700 text-white"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={closeRestoreModal}
                  className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmRestore}
                  disabled={restoreStatus === 'restoring'}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-60 text-white py-2.5 rounded-lg text-sm font-medium"
                >
                  {restoreStatus === 'restoring' ? 'Restoring...' : 'Restore'}
                </button>
              </div>
            )}
          </>
        )}
      </Modal>

      <Modal open={confirmOpen} onClose={closeModal} title="Delete all data?">
        <p className="text-sm text-muted mb-4">
          This will permanently delete <strong>all</strong> assets, liabilities, goals, transactions,
          and snapshots for <strong>{user?.email}</strong>. This action cannot be undone.
        </p>
        <label className="block mb-4">
          <span className="text-xs font-medium text-muted mb-1.5 block">
            Type <strong>DELETE</strong> to confirm<RequiredMark />
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full border border-line bg-white dark:bg-slate-800 text-ink rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </label>
        {status === 'error' && (
          <p className="text-xs text-red-500 mb-4">Something went wrong. Please try again.</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={closeModal}
            className="flex-1 border border-line text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-surface-hover"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={confirmText !== 'DELETE' || status === 'deleting'}
            className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
          >
            {status === 'deleting' ? 'Deleting...' : 'Delete Everything'}
          </button>
        </div>
      </Modal>
    </>
  );
}

export default function Settings() {
  const location = useLocation();
  const initialTab = (location.state as { tab?: Tab } | null)?.tab;
  const [tab] = useUrlTab<Tab>(
    TABS.map((t) => t.key),
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : 'basic'
  );

  // The update banner sends people here with the "New version" dialog already open.
  const [whatsNewOpen, setWhatsNewOpen] = useState(
    () => !!(location.state as { openWhatsNew?: boolean } | null)?.openWhatsNew
  );
  const [updating, setUpdating] = useState(false);
  // Opening "New version" first checks for a deployed update (spinner), then
  // shows the release list only if one is waiting; otherwise the list is empty.
  const pendingUpdate = useUpdateStore((s) => s.updateAvailable);
  const [updateStatus, setUpdateStatus] = useState<'checking' | 'available' | 'uptodate'>('checking');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [checkNonce, setCheckNonce] = useState(0); // bumped by "Check again"
  // Fetch the release notes as soon as an update is known (not only after the dialog
  // opens), so the list is already there when it appears.
  const whatsNew = useWhatsNew(pendingUpdate || (whatsNewOpen && updateStatus === 'available'));
  useEffect(() => {
    if (!whatsNewOpen) return;
    let cancelled = false;
    // An update is already known (banner / red dot): show the list straight away and
    // re-verify quietly. Otherwise a short spinner while the check runs.
    setUpdateStatus(pendingUpdate ? 'available' : 'checking');
    const minSpinner = new Promise((r) => window.setTimeout(r, pendingUpdate ? 0 : 250));
    void Promise.all([isNewVersionDeployed(), minSpinner]).then(([deployed]) => {
      if (cancelled) return;
      setLastChecked(new Date());
      setUpdateStatus(pendingUpdate || deployed === true ? 'available' : 'uptodate');
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [whatsNewOpen, checkNonce]);

  // Phones show the menu first and one section at a time; desktop shows both side by side.
  // Desktop: the menu (left) and the section (right) are two separate scroll
  // areas that together fill exactly the space under the heading, so the page
  // itself never scrolls here. Wheeling over the left moves only the menu;
  // over the right, only the section. The height is measured (not assumed) so
  // it stays exact under the Screen size zoom and when the window resizes.
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const apply = () => {
      if (!window.matchMedia('(min-width: 768px)').matches) {
        el.style.height = '';
        return;
      }
      const z = el.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth || 1 : 1;
      const top = el.getBoundingClientRect().top + window.scrollY; // as if scrolled to the very top
      const main = document.getElementById('main-content');
      const padBottom = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
      const h = (window.innerHeight - top) / z - padBottom - 4;
      el.style.height = `${Math.max(320, Math.floor(h))}px`;
    };
    apply();
    const raf = requestAnimationFrame(apply);
    const t = window.setTimeout(apply, 400); // after the page-in animation / fonts settle
    window.addEventListener('resize', apply);
    const mo = new MutationObserver(apply); // Screen size / Font size changes
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t);
      window.removeEventListener('resize', apply);
      mo.disconnect();
    };
  }, []);

  // Phones: the menu and an open section are two separate history entries,
  // told apart by `open=1` in the URL. Opening a row pushes a new entry, so the
  // phone's Back button (or the arrow at the top) returns to the menu instead of
  // landing on some other section. Desktop ignores `open`.
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  // Forget the one-time "open the dialog" flag so a reload doesn't reopen it.
  useEffect(() => {
    if ((location.state as { openWhatsNew?: boolean } | null)?.openWhatsNew) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Arriving straight at a section (a link, a refresh, or "go to Profiles")
  // shows that section; the entry is then tagged open=1 so Back leaves it normally.
  const [deepLinked, setDeepLinked] = useState(
    () => !!initialTab || (searchParams.has('tab') && searchParams.get('open') !== '1')
  );
  useEffect(() => {
    if (!deepLinked) return;
    setSearchParams({ tab, open: '1' }, { replace: true });
    setDeepLinked(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const mobileOpen = searchParams.get('open') === '1' || deepLinked;
  const openedFromMenu = useRef(false);

  const openItem = (key: Tab) => {
    openedFromMenu.current = true;
    // No manual scrollTo here: scrolling to the top while still on the menu entry made
    // that entry remember "top", so Back landed at the top of the menu. The router-level
    // scroll handling (useScrollRestoration) already starts the new section at the top and
    // returns the menu to exactly where it was left on Back.
    setSearchParams({ tab: key, open: '1' });
  };
  const backToMenu = () => {
    if (openedFromMenu.current) {
      openedFromMenu.current = false;
      navigate(-1);
    } else {
      setSearchParams({ tab }, { replace: true });
    }
  };
  const currentLabel = TABS.find((t) => t.key === tab)?.label ?? '';

  return (
    <div className="space-y-5">
      <div className={mobileOpen ? 'hidden md:block' : ''}>
      <PageHeader
        title="Settings"
      />
      </div>

      <div ref={gridRef} className="grid grid-cols-1 md:grid-cols-[340px_1fr] md:grid-rows-[minmax(0,1fr)] gap-6 items-start md:items-stretch">
        <div
          className={`min-w-0 max-w-full md:min-h-0 md:h-full md:overflow-y-auto md:overscroll-contain ${mobileOpen ? 'hidden md:block' : 'menu-slide-in'}`}
          style={{ scrollbarWidth: 'thin' }}
        >
          <nav className="bg-surface rounded-2xl border border-line overflow-hidden flex flex-col w-full">
            <ProfileHeader />
            {NAV_ITEMS.map((t) => {
              const active = tab === t.key;
              const Icon = NAV_ICONS[t.key];
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => openItem(t.key)}
                  className={`press-row w-full text-left px-5 h-16 border-t border-line text-[15px] flex items-center justify-between gap-2 transition-colors ${
                    active
                      ? 'font-normal text-slate-600 hover:bg-surface-hover hover:text-ink md:bg-surface-muted md:text-ink md:font-semibold'
                      : 'font-normal text-slate-600 hover:bg-surface-hover hover:text-ink'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                      <Icon size={18} strokeWidth={1.75} />
                    </span>
                    {t.label}
                    {t.key === 'shared' && (
                      <span className="text-xs font-medium text-brand-600 bg-brand-50 dark:bg-brand-500/10 dark:text-brand-400 px-2 py-0.5 rounded-full shrink-0">
                        Coming Soon
                      </span>
                    )}
                  </span>
                  <ChevronRight size={16} className="press-chevron text-faint shrink-0" />
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setWhatsNewOpen(true)}
              className="press-row w-full text-left px-5 h-16 border-t border-line text-[15px] font-normal text-slate-600 hover:bg-surface-hover hover:text-ink flex items-center justify-between gap-2 transition-colors"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary-ink">
                  <RefreshCw size={18} strokeWidth={1.75} />
                  <UpdateDot className="-top-0.5 -right-0.5" />
                </span>
                New version
              </span>
              <ChevronRight size={16} className="press-chevron text-faint shrink-0" />
            </button>
          </nav>
        </div>

        <div
          className={`space-y-6 min-w-0 md:min-h-0 md:h-full md:overflow-y-auto md:overscroll-contain ${mobileOpen ? 'section-slide-in' : 'hidden md:block'}`}
          style={{ scrollbarWidth: 'thin' }}
        >
          <button
            type="button"
            onClick={backToMenu}
            className="md:hidden inline-flex items-center gap-2 text-[15px] font-semibold text-ink py-1 mb-3"
          >
            <ArrowLeft size={18} />
            {currentLabel}
          </button>
          {tab === 'basic' && <BasicDetailsCard />}
          {tab === 'reports' && <ReportsTab />}
          {tab === 'password' && <SetPasswordCard />}
          {tab === 'pin' && <AppLockCard />}
          {tab === 'shared' && <SharedAccessCard />}
          {tab === 'preferences' && <PreferencesTab />}
          {tab === 'notifications' && <NotificationsTab />}
          {tab === 'profiles' && <ProfilesTab />}
          {tab === 'data' && <DataTab />}
          {tab === 'shortcuts' && <ShortcutsTab />}
        </div>
      </div>
      <WhatsNewModal
        open={whatsNewOpen}
        onClose={() => setWhatsNewOpen(false)}
        notes={whatsNew}
        status={updateStatus}
        lastChecked={lastChecked}
        onRecheck={() => setCheckNonce((n) => n + 1)}
        updating={updating}
        onUpdate={() => {
          setUpdating(true);
          void hardRefresh().then((ok) => {
            if (!ok) setUpdating(false);
          });
        }}
      />
    </div>
  );
}
