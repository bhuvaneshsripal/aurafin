import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import {
  updateProfile,
  updatePassword,
  linkWithCredential,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  EmailAuthProvider,
} from 'firebase/auth';
import { Lock, Smartphone, Users, Check, ShieldCheck, Trash2, AlertTriangle, Plus, Crown, Copy, HelpCircle, Eye, EyeOff, Minus, Type, Maximize, Pencil, X, Download, Upload, Sparkles, QrCode, Zap } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAvatarStore } from '../store/avatarStore';
import { useAppLockStore } from '../store/appLockStore';
import { useDisplaySettingsStore, FONT_MIN_SCALE, FONT_MAX_SCALE, SCREEN_MIN_SCALE, SCREEN_MAX_SCALE } from '../store/displaySettingsStore';
import PinBoxInput from '../components/PinBoxInput';
import { auth } from '../firebase/config';
import { CURRENCIES } from '../utils/currency';
import { loadImageFromFile } from '../utils/imageResize';
import AvatarCropModal from '../components/AvatarCropModal';
import { sendSharedAccessInvite, isInviteEmailConfigured } from '../utils/otp';
import {
  SECURITY_QUESTIONS,
  saveSecurityAnswer,
  getSecurityQuestion,
  verifySecurityAnswer,
} from '../utils/securityQuestion';
import { deleteAllUserData, upsertDoc, removeDoc, saveAvatar, removeAvatar, assignOrphanDataToProfile, reassignProfileData, setDefaultProfile, bulkUpsertDocs } from '../hooks/useFirestoreSync';
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
import { usePremiumStore, selectIsPremium } from '../store/premiumStore';
import { checkRedeemCode, isPromo20Code, isPromo1RsCode, PROMO20_CODE, PROMO20_PCT, PROMO1RS_PRICE, PLAN_CODES } from '../utils/premiumCodes';
import { PRICING_PLANS, PLAN_LABELS, buildUpiLink, type PricingPlan } from '../config/payments';
import { PRO_FEATURES } from '../config/proFeatures';
import UpiQrCode from '../components/UpiQrCode';
import { useIsPro } from '../hooks/useIsPro';
import ProBadge from '../components/pro/ProBadge';
import type { HouseholdProfile, PremiumStatus } from '../types';
import Modal from '../components/Modal';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useUrlTab } from '../hooks/useUrlTab';

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

function AvatarEditor() {
  const user = useAuthStore((s) => s.user);
  const customUrl = useAvatarStore((s) => s.dataUrl);
  const setCustomUrl = useAvatarStore((s) => s.setDataUrl);

  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [error, setError] = useState('');
  const [cropImage, setCropImage] = useState<HTMLImageElement | null>(null);

  const displayUrl = customUrl ?? user?.photoURL ?? null;
  const initial = (user?.displayName ?? user?.email ?? 'A').charAt(0).toUpperCase();

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setError('');
    try {
      const img = await loadImageFromFile(file);
      // Opens the crop/zoom editor instead of saving immediately — the
      // person positions and zooms the photo, then confirms.
      setCropImage(img);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not read that image.');
      setStatus('error');
    }
  };

  const handleCropConfirm = async (dataUrl: string) => {
    setCropImage(null);
    if (!user) return;
    setStatus('saving');
    setError('');
    try {
      // Reflect it immediately rather than waiting on the round-trip to
      // Firestore and back through the live listener.
      setCustomUrl(dataUrl);
      await saveAvatar(user.uid, dataUrl);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update your photo.');
      setStatus('error');
    }
  };

  const handleRemove = async () => {
    if (!user) return;
    setStatus('saving');
    setError('');
    try {
      setCustomUrl(null);
      await removeAvatar(user.uid);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove your photo.');
      setStatus('error');
    }
  };

  return (
    <div className="flex items-center gap-4 mb-5">
      <div className="relative shrink-0">
        {displayUrl ? (
          <img
            src={displayUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="h-16 w-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
          />
        ) : (
          <div className="h-16 w-16 rounded-full bg-brand-600 text-white flex items-center justify-center text-xl font-semibold">
            {initial}
          </div>
        )}

        <label
          title="Edit photo"
          className="icon-outline-green tap-scale absolute -bottom-1 -right-1 h-8 w-8 shadow-sm flex items-center justify-center cursor-pointer"
        >
          <Pencil size={14} />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={status === 'saving'}
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              handleFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Profile photo</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
          {status === 'saving' ? 'Saving...' : 'JPG or PNG — drag and zoom to crop after choosing one.'}
        </p>
        <div className="flex items-center gap-3 mt-1.5">
          <label className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline cursor-pointer">
            Change
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={status === 'saving'}
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                handleFile(file);
                e.target.value = '';
              }}
            />
          </label>
          {customUrl && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={status === 'saving'}
              className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-green-600 dark:hover:text-green-400 disabled:opacity-50"
            >
              <X size={12} />
              Remove
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
      </div>

      <AvatarCropModal
        open={!!cropImage}
        image={cropImage}
        onCancel={() => setCropImage(null)}
        onConfirm={handleCropConfirm}
      />
    </div>
  );
}

function PersonalInfoCard() {
  const user = useAuthStore((s) => s.user);
  const [editingName, setEditingName] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const startEdit = () => {
    setDisplayName(user?.displayName ?? '');
    setStatus('idle');
    setEditingName(true);
  };

  const cancelEdit = () => {
    setDisplayName(user?.displayName ?? '');
    setStatus('idle');
    setEditingName(false);
  };

  const save = async () => {
    if (!auth.currentUser) return;
    setStatus('saving');
    try {
      await updateProfile(auth.currentUser, { displayName });
      setStatus('idle');
      setEditingName(false);
    } catch {
      setStatus('error');
    }
  };

  return (
    <Card>
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-4">Personal info</h2>
      <AvatarEditor />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Display Name</label>
          {editingName ? (
            <>
              <input
                autoFocus
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save();
                  if (e.key === 'Escape') cancelEdit();
                }}
                className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
              <div className="flex items-center gap-3 mt-1.5">
                <button
                  onClick={save}
                  disabled={status === 'saving'}
                  className="text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline disabled:opacity-50"
                >
                  {status === 'saving' ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={cancelEdit}
                  disabled={status === 'saving'}
                  className="text-xs font-medium text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
              {status === 'error' && <p className="text-xs text-red-500 mt-1.5">Something went wrong. Please try again.</p>}
            </>
          ) : (
            <div className="flex items-center gap-2 h-[38px]">
              <span className="text-sm text-slate-800 dark:text-slate-100 truncate">
                {user?.displayName || <span className="text-slate-400 dark:text-slate-500">Not set</span>}
              </span>
              <button
                onClick={startEdit}
                title="Edit name"
                aria-label="Edit name"
                className="text-slate-300 dark:text-slate-600 hover:text-brand-600 dark:hover:text-brand-400 shrink-0"
              >
                <Pencil size={14} />
              </button>
            </div>
          )}
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
    </Card>
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
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Set Password</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
        {hasPasswordProvider
          ? 'Update the password you use to sign in with email and password.'
          : 'Set a password so you can also sign in with email and password, in addition to Google.'}
      </p>

      {mode === 'form' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasPasswordProvider && (
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showOldPassword ? 'text' : 'password'}
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg pl-3 pr-10 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowOldPassword((v) => !v)}
                    aria-label={showOldPassword ? 'Hide password' : 'Show password'}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min 6 characters"
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

            {!hasPasswordProvider && (
              <>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">
                    Security Question
                  </label>
                  <select
                    value={securityQuestion}
                    onChange={(e) => setSecurityQuestion(e.target.value)}
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                  >
                    {SECURITY_QUESTIONS.map((q) => (
                      <option key={q} value={q}>
                        {q}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Answer</label>
                  <input
                    value={securityAnswer}
                    onChange={(e) => setSecurityAnswer(e.target.value)}
                    placeholder="Your answer"
                    className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
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
                className="text-xs text-slate-400 dark:text-slate-500 font-medium hover:text-brand-600 dark:hover:text-brand-400"
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
            <HelpCircle size={16} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="text-sm text-slate-700 dark:text-slate-200">{forgotQuestion}</p>
          </div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1.5">Your Answer</label>
          <input
            value={forgotAnswer}
            onChange={(e) => setForgotAnswer(e.target.value)}
            placeholder="Answer"
            autoFocus
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {forgotError && <p className="text-xs text-red-500 mt-2">{forgotError}</p>}
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setMode('form')}
              className="border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
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
            className="mt-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Back
          </button>
        </div>
      )}
    </Card>
  );
}

function AppLockCard() {
  const { enabled, setPin, disable, lockNow } = useAppLockStore();
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
            Require a 4-digit PIN to open the app. Locks automatically after 1 minute in the background, or tap "Lock Now" to lock it instantly — handy on a laptop before stepping away.
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
              onClick={lockNow}
              className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-full text-sm font-medium"
            >
              <Lock size={16} />
              Lock Now
            </button>
            <button
              onClick={() => setConfirmDisable(true)}
              className="bg-cream-100 dark:bg-slate-800 border border-cream-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-cream-200 dark:hover:bg-slate-700"
            >
              Disable Lock
            </button>
            <button
              onClick={() => setOpen(true)}
              className="bg-cream-100 dark:bg-slate-800 border border-cream-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-full text-sm font-medium hover:bg-cream-200 dark:hover:bg-slate-700"
            >
              Change PIN
            </button>
          </>
        ) : (
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-full text-sm font-medium"
          >
            <Lock size={16} />
            Set Up PIN
          </button>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Set Up App Lock">
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 text-center">4-digit PIN</label>
            <PinBoxInput value={pin} onChange={setPinInput} autoFocus />
          </div>
          <div>
            <label className="block text-xs text-slate-500 dark:text-slate-400 mb-2 text-center">Confirm PIN</label>
            <PinBoxInput value={confirmPin} onChange={setConfirmPin} />
          </div>
          {pinError && <p className="text-xs text-red-500">{pinError}</p>}
          <button
            onClick={savePin}
            className="w-full bg-brand-600 hover:bg-brand-700 text-white py-2 rounded-full text-sm font-medium"
          >
            Save PIN
          </button>
        </div>
      </Modal>

      <Modal open={confirmDisable} onClose={() => setConfirmDisable(false)} title="Disable App Lock?">
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Anyone with access to this device will be able to open <span className="font-luxury">Aurafin</span> without a PIN.
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
  const installed = useInstallPromptStore((s) => s.installed);

  return (
    <Card>
      <div className="flex gap-3">
        <Smartphone size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Install App</h2>
          {installed ? (
            <p className="text-xs text-brand-600 mt-1 flex items-center gap-1">
              <Check size={13} /> <span className="font-luxury">Aurafin</span> is installed as an app on this device
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
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
            onClick={triggerInstallPrompt}
            className="mt-4 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Show Install Prompt
          </button>
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

  const [pendingRemoveInvite, setPendingRemoveInvite] = useState<SharedInvite | null>(null);
  const confirmRemoveInvite = () => {
    if (!pendingRemoveInvite) return;
    removeInvite(pendingRemoveInvite.id);
    setPendingRemoveInvite(null);
  };

  return (
    <Card>
      <div className="flex gap-3">
        <Users size={20} className="text-slate-700 dark:text-slate-300 shrink-0 mt-0.5" />
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Shared Access</h2>
            <ProBadge size="xs" />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            Share your financial data with up to 5 trusted people — spouse, financial advisor, CA, or
            anyone you choose. Each person gets View Only or Full Access.
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
                onClick={() => setPendingRemoveInvite(invite)}
                className="text-slate-400 hover:text-green-600 dark:hover:text-green-400 p-1"
                aria-label={`Remove ${invite.email}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}

      <ConfirmDeleteModal
        open={!!pendingRemoveInvite}
        onClose={() => setPendingRemoveInvite(null)}
        onConfirm={confirmRemoveInvite}
        title="Remove this person?"
        description={
          <>
            <strong>{pendingRemoveInvite?.email}</strong> will lose access to your Aurafin data. This can't be
            undone (though you can invite them again later).
          </>
        }
        confirmLabel="Remove"
      />
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
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0 border-b last:border-b-0 border-slate-100 dark:border-slate-800">
      <div className="flex items-start gap-3 min-w-0">
        <div className="text-slate-400 dark:text-slate-500 mt-0.5 shrink-0">{icon}</div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-slate-800 dark:text-slate-100">{label}</h3>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{description}</p>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onDecrease}
          disabled={atMin}
          aria-label={`Decrease ${label.toLowerCase()}`}
          className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
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
          className="h-8 w-8 flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
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
      <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Display Size</h2>
      <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
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

function PreferencesTab() {
  const [baseCurrency, setBaseCurrency] = useState('INR');
  return (
    <>
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Base Currency</h2>
          <ProBadge size="xs" />
        </div>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Your net worth and totals will be shown in this currency across the dashboard — with full
          multi-currency support for assets held in any currency.
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
      <DisplaySizeCard />
    </>
  );
}

function ProfilesTab() {
  const user = useAuthStore((s) => s.user);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const setActiveProfileId = useHouseholdProfilesStore((s) => s.setActiveProfileId);
  // Family Profiles is a Pro feature — gated by useIsPro() rather than raw
  // premium status, so it stays fully usable while PRO_ACCESS_BYPASSED is
  // true (see src/config/proFeatures.ts).
  const isPremium = useIsPro();

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

  const freeProfileLimit = 2; // owner (default) + 1 family member, free
  const canAddMore = isPremium || profiles.length < freeProfileLimit;
  const maxProfiles = 5;

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
      await assignOrphanDataToProfile(user.uid, 'assets', allAssets, profileId);
      await assignOrphanDataToProfile(user.uid, 'liabilities', allLiabilities, profileId);
      await assignOrphanDataToProfile(user.uid, 'goals', allGoals, profileId);
      await assignOrphanDataToProfile(user.uid, 'transactions', allTransactions, profileId);
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
      await reassignProfileData(user.uid, 'assets', allAssets, fromProfileId, toProfileId);
      await reassignProfileData(user.uid, 'liabilities', allLiabilities, fromProfileId, toProfileId);
      await reassignProfileData(user.uid, 'goals', allGoals, fromProfileId, toProfileId);
      await reassignProfileData(user.uid, 'transactions', allTransactions, fromProfileId, toProfileId);
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
    await setDefaultProfile(user.uid, profiles.map((p) => p.id), id);
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
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Family Profiles</h2>
            <ProBadge size="xs" />
          </div>
          <Users size={16} className="text-slate-400" />
        </div>
        <p className="text-xs text-slate-600 dark:text-slate-300 mb-4">
          Manage your profiles. Each profile has its own assets, liabilities, transactions, and goals.{' '}
          {profiles.length}/{isPremium ? maxProfiles : freeProfileLimit} profiles
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
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: p.colour }}
                  />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{p.name}</span>
                  {isDefault && (
                    <span className="text-[10px] font-semibold tracking-wide uppercase text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
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
                        className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-300 disabled:opacity-50"
                      >
                        {movingId === p.id ? 'Moving…' : 'Move data to…'}
                      </button>
                      {moveMenuFor === p.id && (
                        <div className="absolute right-0 top-full mt-1 z-10 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                          {otherProfiles.map((target) => (
                            <button
                              key={target.id}
                              onClick={() => handleMoveData(p.id, target.id)}
                              className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
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
                      className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-brand-600 dark:hover:text-brand-300"
                    >
                      Set default
                    </button>
                  )}
                  {!isDefault && (
                    <button
                      onClick={() => setPendingDeleteProfile(p)}
                      className="text-slate-300 dark:text-slate-600 hover:text-green-600 dark:hover:text-green-400"
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
          <div className="flex items-center justify-between bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <Crown size={16} className="text-amber-600 dark:text-amber-400" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Free accounts get {freeProfileLimit} profiles (you + 1 family member). Upgrade to Premium to add the
                rest of the household.
              </p>
            </div>
          </div>
        )}
      </Card>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add Profile">
        <div className="space-y-4">
          <label className="block">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Dad, Mom, Priya"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Colour</span>
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
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Name</span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g. Dad, Mom, Priya"
              className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </label>
          <div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">Colour</span>
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

const PREMIUM_FEATURES = [
  'Unlimited household profiles',
  'Live price refresh (NSE + Yahoo)',
  'CSV / Excel import',
  'Priority feature requests',
];

// Purchasing Premium (redeem codes, discount code, plan picker + UPI
// payment) isn't live yet — flip this back to true to restore it once
// payments are ready. Kept as a single flag rather than deleting the flow
// so nothing has to be rebuilt later.
const PREMIUM_PURCHASE_ENABLED = false;

type ProPlanId = 'monthly' | 'quarterly' | 'lifetime';

const PRO_PLANS: {
  id: ProPlanId;
  label: string;
  price: number;
  cadence: string;
  months?: number;
  sublabel?: string;
  perDayDays: number;
  perDayNote?: string;
}[] = [
  { id: 'monthly', label: '1 Month', price: 99, cadence: '/month', months: 1, perDayDays: 30 },
  {
    id: 'quarterly',
    label: '3 Months',
    price: 199,
    cadence: 'for 3 months',
    months: 3,
    perDayDays: 90,
  },
  {
    id: 'lifetime',
    label: 'Lifetime',
    price: 399,
    cadence: 'one-time, forever',
    perDayDays: 730,
    perDayNote: 'over 2 years',
  },
];

// The plan visually led with as "Recommended" — it's the one with real
// savings vs. paying monthly, so it's the one worth steering people to.
const RECOMMENDED_PLAN_ID: ProPlanId = 'monthly';

// The full Aurafin Pro showcase, moved here from the old standalone /pro
// page — that page has been retired (see the /pro -> /settings?tab=billing
// redirect in App.tsx) and its content now lives directly in Billing so
// upgrade info sits alongside the rest of the account/plan details.
function ProShowcase() {
  const [clicked, setClicked] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<ProPlanId>(RECOMMENDED_PLAN_ID);
  const [promoInput, setPromoInput] = useState('');
  const [applyResult, setApplyResult] = useState<'idle' | 'applied' | 'invalid'>('idle');

  // AURA20 is the public, advertised code — 20% off every plan.
  const promo20Applied = isPromo20Code(promoInput);
  // AURA1RS is an intentionally hidden code — one month for ₹1. It's never
  // named or hinted at in the UI; it only works if someone already knows
  // the exact string and types it in.
  const promo1RsApplied = isPromo1RsCode(promoInput);
  const promoApplied = promo20Applied || promo1RsApplied;

  const displayPrice = (plan: (typeof PRO_PLANS)[number]) => {
    if (promo1RsApplied && plan.id === 'monthly') return PROMO1RS_PRICE;
    if (promo20Applied) return Math.round(plan.price * 0.8);
    return plan.price;
  };
  const isDiscounted = (plan: (typeof PRO_PLANS)[number]) => displayPrice(plan) !== plan.price;

  const monthlyPlan = PRO_PLANS.find((p) => p.id === 'monthly')!;
  const recommendedPlan = PRO_PLANS.find((p) => p.id === RECOMMENDED_PLAN_ID)!;
  const otherPlans = PRO_PLANS.filter((p) => p.id !== RECOMMENDED_PLAN_ID);
  const selected = PRO_PLANS.find((p) => p.id === selectedPlan)!;

  const savePct =
    recommendedPlan.months && monthlyPlan.price > 0
      ? Math.round((1 - recommendedPlan.price / (monthlyPlan.price * recommendedPlan.months)) * 100)
      : 0;

  const applyPromo = () => {
    setApplyResult(promoApplied ? 'applied' : promoInput.trim() ? 'invalid' : 'idle');
  };
  const quickApplyPromo = () => {
    setPromoInput(PROMO20_CODE);
    setApplyResult('applied');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-5">
        {/* ---- Header ---- */}
        <div className="flex items-start gap-2.5">
          <Crown size={20} className="text-brand-600 mt-0.5 shrink-0" />
          <div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Upgrade to Aurafin Pro</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Every Pro feature below is already unlocked for you — pick a plan for when payments go live.
            </p>
          </div>
        </div>

        {/* ---- Recommended plan — big highlighted card ---- */}
        <button
          type="button"
          onClick={() => setSelectedPlan(recommendedPlan.id)}
          className={`relative w-full text-left rounded-3xl border-2 p-6 transition-colors ${
            selectedPlan === recommendedPlan.id
              ? 'border-brand-500 bg-brand-50/70 dark:bg-brand-900/20'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
          }`}
        >
          <span
            className={`absolute top-4 right-4 flex items-center justify-center w-7 h-7 rounded-full border-2 shrink-0 transition-colors ${
              selectedPlan === recommendedPlan.id
                ? 'bg-brand-600 border-brand-600'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
            }`}
          >
            {selectedPlan === recommendedPlan.id && <Check size={15} strokeWidth={3} className="text-white" />}
          </span>

          <span className="inline-flex items-center bg-brand-600 text-white text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
            Recommended
          </span>

          <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-3">
            {isDiscounted(recommendedPlan) && (
              <span className="text-lg text-slate-400 dark:text-slate-500 line-through">
                ₹{recommendedPlan.price}
              </span>
            )}
            <span className="text-3xl font-bold text-slate-900 dark:text-white">
              ₹{displayPrice(recommendedPlan)}
            </span>
            <span className="text-sm text-slate-500 dark:text-slate-400">{recommendedPlan.cadence}</span>
            {savePct > 0 && !isDiscounted(recommendedPlan) && (
              <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                Save {savePct}%
              </span>
            )}
            {isDiscounted(recommendedPlan) && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                <Sparkles size={10} /> Promo applied
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
            {recommendedPlan.months && recommendedPlan.months > 1
              ? `Just ₹${Math.round(displayPrice(recommendedPlan) / recommendedPlan.months)}/mo. `
              : ''}
            That's about ₹{(displayPrice(recommendedPlan) / recommendedPlan.perDayDays).toFixed(2)}/day.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-brand-200/60 dark:border-brand-800/40">
            {PRO_FEATURES.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                {f.label}
              </div>
            ))}
          </div>
        </button>

        {/* ---- Other plans — compact side-by-side boxes ---- */}
        <div className="grid grid-cols-2 gap-3">
          {otherPlans.map((plan) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => setSelectedPlan(plan.id)}
              className={`relative text-left rounded-3xl border p-4 transition-colors ${
                selectedPlan === plan.id
                  ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                {plan.label}
              </p>
              <div className="flex items-baseline gap-1.5 mt-1">
                {isDiscounted(plan) && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 line-through">₹{plan.price}</span>
                )}
                <p className="font-bold text-xl text-slate-900 dark:text-white">₹{displayPrice(plan)}</p>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                {plan.sublabel ??
                  (plan.months ? `₹${Math.round(displayPrice(plan) / plan.months)}/mo` : plan.cadence)}
              </p>
              {selectedPlan === plan.id && (
                <span className="absolute top-3 right-3 flex items-center justify-center w-5 h-5 rounded-full bg-brand-600">
                  <Check size={12} className="text-white" />
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ---- CTA ---- */}
        <button
          type="button"
          onClick={() => setClicked(true)}
          className="w-full flex items-center justify-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-sm transition-colors"
        >
          <Sparkles size={16} />
          {clicked ? "You're already Pro" : `Get Pro for ₹${displayPrice(selected)}${selected.months === 1 ? '/month' : selected.months ? `/${selected.months}mo` : ' (one-time)'}`}
        </button>
        <p className="text-center text-[11px] font-medium text-brand-600 dark:text-brand-500 -mt-2.5">
          {clicked
            ? 'Every Pro feature is unlocked for you already — enjoy!'
            : 'Available soon — every Pro feature already works for you'}
        </p>

        {/* ---- Coupon row ---- */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Have a coupon?</span>
          <div className="relative flex-1 min-w-[120px]">
            <input
              value={promoInput}
              onChange={(e) => {
                setPromoInput(e.target.value);
                setApplyResult('idle');
              }}
              placeholder="Enter code"
              className={`w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 transition-colors ${
                promoInput ? 'pr-8' : ''
              }`}
            />
            {promoInput && (
              <button
                type="button"
                onClick={() => {
                  setPromoInput('');
                  setApplyResult('idle');
                }}
                aria-label="Clear code"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={applyPromo}
            disabled={!promoInput.trim()}
            className="bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 text-white dark:text-slate-900 px-4 py-1.5 rounded-full text-sm font-medium shrink-0"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={quickApplyPromo}
            className="flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300 shrink-0"
          >
            <Sparkles size={12} /> Save {PROMO20_PCT}% with {PROMO20_CODE}
          </button>
        </div>
        {applyResult === 'applied' && (
          <p className="text-xs text-brand-600 dark:text-brand-300 -mt-2">
            🎉 Promo applied — the discounted price is shown above.
          </p>
        )}
        {applyResult === 'invalid' && (
          <p className="text-xs text-red-500 -mt-2">That code doesn't look right.</p>
        )}
      </div>

      {/* ---- Bottom strip ---- */}
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
        <Zap size={13} className="text-brand-600" />
        Built for people who take their money seriously.
      </div>
    </div>
  );
}

// Extra-rounded card used only on the Billing tab, per request — the shared
// Card component above is left untouched so other tabs keep their look.
function BillingCard({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
      {children}
    </div>
  );
}

function BillingTab() {
  const user = useAuthStore((s) => s.user);
  const premiumStatus = usePremiumStore((s) => s.status);
  const isPremium = usePremiumStore(selectIsPremium);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<'idle' | 'success' | 'invalid' | 'discount-only'>('idle');
  const [copied, setCopied] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);

  // AURA20 auto-applies live as soon as it's typed correctly — no button press needed.
  const promoApplied = isPromo20Code(code);

  const monthlyPlan = PRICING_PLANS.find((p) => p.id === 'monthly') ?? PRICING_PLANS[0];
  const quarterlyPlan = PRICING_PLANS.find((p) => p.id === 'quarterly') ?? PRICING_PLANS[0];
  const lifetimePlan = PRICING_PLANS.find((p) => p.id === 'lifetime') ?? PRICING_PLANS[0];

  const discountedPrice = (price: number) =>
    promoApplied ? Math.round(price * (1 - PROMO20_PCT / 100)) : price;

  const quarterlySavingsPct =
    monthlyPlan.price > 0
      ? Math.round((1 - quarterlyPlan.price / (monthlyPlan.price * 3)) * 100)
      : 0;
  const [selectedPlan, setSelectedPlan] = useState<PricingPlan | null>(quarterlyPlan);

  // With AURA20 applied, the plan actually paid (and the QR/payment link)
  // reflects the discounted price.
  const payablePlan: PricingPlan | null =
    selectedPlan && promoApplied
      ? { ...selectedPlan, price: Math.round(selectedPlan.price * (1 - PROMO20_PCT / 100)) }
      : selectedPlan;

  // Any change to the plan or the discount means the QR would point at a
  // stale amount, so it needs to be regenerated on request again.
  useEffect(() => {
    setQrGenerated(false);
  }, [selectedPlan?.id, promoApplied]);

  const handleRedeem = async () => {
    if (!user) return;
    const check = checkRedeemCode(code);
    if (check.kind === 'invalid') {
      setResult('invalid');
      return;
    }
    if (check.kind === 'discount') {
      // A 15%-discount code doesn't unlock Premium by itself — it's just a
      // promo code to apply when actually paying. Nothing to change here.
      setResult('discount-only');
      return;
    }
    if (check.kind === 'promo20') {
      // It's already auto-applied live as they type it, but pressing Redeem
      // should still give a clear, unmistakable "yes, this worked" moment —
      // otherwise nothing visibly changes when the button is pressed.
      setResult('success');
      return;
    }
    const now = Date.now();
    const status: PremiumStatus = {
      id: 'status',
      isPremium: true,
      isDeveloper: check.kind === 'developer',
      planId: check.kind === 'plan' ? check.planId : undefined,
      redeemedCode: check.kind === 'developer' ? 'DEVELOPER' : PLAN_CODES[check.planId].code,
      redeemedAt: now,
      expiresAt: check.kind === 'plan' && check.durationDays ? now + check.durationDays * 24 * 60 * 60 * 1000 : undefined,
    };
    await upsertDoc(user, 'premium', status);
    setResult('success');
    setCode('');
  };

  const copyCode = () => {
    navigator.clipboard?.writeText(PROMO20_CODE).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-6">
      <BillingCard>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Current Plan</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {isPremium ? (
                premiumStatus?.isDeveloper ? (
                  "You're on Premium (developer unlock)."
                ) : (
                  <>
                    You're on Premium
                    {premiumStatus?.planId ? ` (${PLAN_LABELS[premiumStatus.planId]})` : ''}.{' '}
                    {premiumStatus?.expiresAt
                      ? `Renews/expires ${new Date(premiumStatus.expiresAt).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}.`
                      : 'No expiry — lifetime.'}
                  </>
                )
              ) : (
                "You're on the Free plan."
              )}
            </p>
          </div>
          {isPremium ? (
            <Crown size={18} className="text-brand-600" />
          ) : (
            <Check size={18} className="text-brand-600" />
          )}
        </div>
        {!isPremium && (
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
            Premium unlocks unlimited household profiles and future advanced features.
          </p>
        )}
      </BillingCard>

      {PREMIUM_PURCHASE_ENABLED ? (
        <>
      {!isPremium && (
        <BillingCard>
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={14} className="text-brand-500" />
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Keep Pro After Trial</h2>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
            Loving Pro? Pick a plan below, pay via UPI, and message the developer with your payment
            screenshot to get your redeem code.
          </p>

          {/* Recommended plan — big highlighted box */}
          <button
            onClick={() => setSelectedPlan(quarterlyPlan)}
            className={`relative w-full text-left rounded-3xl border-2 p-5 pr-14 transition-colors ${
              selectedPlan?.id === quarterlyPlan.id
                ? 'border-brand-500 bg-brand-50/70 dark:bg-brand-900/20'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60'
            }`}
          >
            {/* corner check — mirrors the reference screenshot's selection indicator */}
            <span
              className={`absolute top-4 right-4 flex items-center justify-center w-6 h-6 rounded-full border-2 shrink-0 transition-colors ${
                selectedPlan?.id === quarterlyPlan.id
                  ? 'bg-brand-600 border-brand-600'
                  : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
              }`}
            >
              {selectedPlan?.id === quarterlyPlan.id && <Check size={14} strokeWidth={3} className="text-white" />}
            </span>

            <span className="inline-flex items-center bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full">
              Recommended
            </span>

            <div className="flex items-baseline flex-wrap gap-x-2 gap-y-1 mt-3">
              {promoApplied && (
                <span className="text-lg text-slate-400 dark:text-slate-500 line-through">
                  ₹{quarterlyPlan.price}
                </span>
              )}
              <span className="font-hero-numeric text-3xl text-slate-900 dark:text-white">
                ₹{discountedPrice(quarterlyPlan.price)}
              </span>
              <span className="text-sm text-slate-500 dark:text-slate-400">
                for {quarterlyPlan.label.toLowerCase()}
              </span>
              {promoApplied ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                  <Sparkles size={10} /> AURA20 applied
                </span>
              ) : (
                quarterlySavingsPct > 0 && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-900/40 px-2 py-0.5 rounded-full">
                    Save {quarterlySavingsPct}%
                  </span>
                )
              )}
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Just ₹{Math.round(discountedPrice(quarterlyPlan.price) / 3)}/mo. That's about ₹
              {(discountedPrice(quarterlyPlan.price) / 90).toFixed(1)}/day.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
              {PREMIUM_FEATURES.map((feature) => (
                <div key={feature} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <Check size={14} className="text-brand-600 dark:text-brand-400 shrink-0" />
                  {feature}
                </div>
              ))}
            </div>
          </button>

          {/* Other plans — compact side-by-side boxes */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            {[monthlyPlan, lifetimePlan].map((plan) => (
              <button
                key={plan.id}
                onClick={() => setSelectedPlan(plan)}
                className={`relative text-left rounded-3xl border p-4 transition-colors ${
                  selectedPlan?.id === plan.id
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-900/20'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  {plan.label}
                </p>
                <div className="flex items-baseline gap-1.5 mt-1">
                  {promoApplied && (
                    <span className="text-xs text-slate-400 dark:text-slate-500 line-through">₹{plan.price}</span>
                  )}
                  <p className="font-hero-numeric text-xl text-slate-900 dark:text-white">
                    ₹{discountedPrice(plan.price)}
                  </p>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{plan.blurb}</p>
                {selectedPlan?.id === plan.id && (
                  <span className="absolute top-3 right-3 flex items-center justify-center w-5 h-5 rounded-full bg-brand-600">
                    <Check size={12} className="text-white" />
                  </span>
                )}
              </button>
            ))}
          </div>

          {selectedPlan && payablePlan && (
            <>
              {promoApplied && (
                <p className="flex items-center gap-1 text-xs text-brand-600 dark:text-brand-300 mt-4">
                  <Sparkles size={12} />
                  <span className="line-through text-slate-400 dark:text-slate-500">₹{selectedPlan.price}</span>
                  20% off with AURA20 — ₹{payablePlan.price}
                </p>
              )}
              <a
                href={buildUpiLink(payablePlan)}
                className="mt-4 flex items-center justify-center gap-2 w-full bg-brand-600 hover:bg-brand-700 text-white px-5 py-3.5 rounded-2xl text-sm font-semibold shadow-sm transition-colors"
              >
                <Sparkles size={16} />
                Get Pro for ₹{payablePlan.price}/{PLAN_LABELS[selectedPlan.id]}
              </a>
            </>
          )}

          {/* Coupon row — compact, inline, matches the reference screenshot */}
          <div className="flex items-center gap-2 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">Have a coupon?</span>
            <div className="relative flex-1">
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setResult('idle');
                }}
                placeholder="Enter code"
                className={`w-full border bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-full px-3 py-1.5 text-sm focus:outline-none focus:ring-2 transition-colors ${
                  promoApplied
                    ? 'border-brand-400 focus:ring-brand-500 pr-8'
                    : 'border-slate-200 dark:border-slate-700 focus:ring-brand-500'
                }`}
              />
              {promoApplied && (
                <Sparkles
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-500 animate-pulse"
                />
              )}
            </div>
            <button
              onClick={handleRedeem}
              disabled={!code.trim()}
              className="bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 text-white dark:text-slate-900 px-4 py-1.5 rounded-full text-sm font-medium shrink-0"
            >
              Apply
            </button>
          </div>
          {result === 'success' && (
            <p className="text-xs text-brand-600 dark:text-brand-300 mt-2">
              {promoApplied ? '🎉 AURA20 applied — the discounted price is shown above.' : 'Code applied — thanks!'}
            </p>
          )}
          {result === 'discount-only' && !promoApplied && (
            <p className="text-xs text-brand-600 dark:text-brand-500 mt-2">
              That's a discount code, not an unlock code — mention it when you pay via UPI above.
            </p>
          )}
          {result === 'invalid' && <p className="text-xs text-red-500 mt-2">That code doesn't look right.</p>}
          <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1.5">
            Try <span className="font-mono">AURA20</span> for 20% off — it auto-applies as you type it.
          </p>

          {selectedPlan && payablePlan && (
            <div className="flex flex-col sm:flex-row items-center gap-5 mt-5 pt-5 border-t border-slate-100 dark:border-slate-800">
              {qrGenerated ? (
                <UpiQrCode link={buildUpiLink(payablePlan)} />
              ) : (
                <button
                  onClick={() => setQrGenerated(true)}
                  className="flex flex-col items-center justify-center gap-1.5 w-[160px] h-[160px] rounded-3xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-brand-400 hover:text-brand-600 dark:hover:text-brand-300 transition-colors shrink-0"
                >
                  <QrCode size={22} />
                  <span className="text-xs font-medium">Generate QR</span>
                </button>
              )}
              <div className="flex-1 space-y-1">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {qrGenerated
                    ? 'Scan the QR with any UPI app, or tap the button above on mobile.'
                    : 'Tap "Generate QR" to create a scannable code for this amount, or just tap the button above on mobile.'}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  After paying, contact the developer (see "Contact us" in the sidebar) with your
                  screenshot to receive your redeem code.
                </p>
              </div>
            </div>
          )}
        </BillingCard>
      )}

      {!isPremium && (
        <BillingCard>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Your discount code</h2>
          <p className="text-xs text-slate-400 dark:text-slate-500 mb-3">
            Share this with anyone — it gets them 20% off Premium.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-3xl px-3 py-2 text-sm font-mono text-slate-700 dark:text-slate-200">
              {PROMO20_CODE}
            </code>
            <button
              onClick={copyCode}
              className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-3xl text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Copy size={14} /> {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </BillingCard>
      )}
        </>
      ) : (
        !isPremium && <ProShowcase />
      )}
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
      await deleteAllUserData(user.uid);
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
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Backup</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Download everything in your account as a single JSON file, and restore it back into any
          account later — useful before switching devices or just as a safety copy.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Download backup</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Saves all assets, liabilities, goals, transactions, snapshots, budgets, and profiles.
            </p>
            <button
              onClick={handleDownloadBackup}
              className="mt-3 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              <Download size={16} />
              Download JSON Backup
            </button>
          </div>

          <div className="flex-1 border border-slate-200 dark:border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Restore from backup</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Adds the items from a backup file into this account. Existing data is kept.
            </p>
            <label className="mt-3 inline-flex items-center gap-2 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 px-4 py-2 rounded-lg text-sm font-medium cursor-pointer">
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
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-1">Data</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
          Your data is stored in your own Firebase project. You can export it any time from the Firebase
          console, or permanently remove everything you've entered in <span className="font-luxury">Aurafin</span> below.
        </p>

        <div className="flex gap-3 border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 rounded-xl p-4">
          <AlertTriangle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">Delete all data</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Permanently removes every asset, liability, goal, transaction, and snapshot in your
              account. Your login itself is not deleted — you'll stay signed in with an empty account.
              This cannot be undone.
            </p>
            <button
              onClick={() => setConfirmOpen(true)}
              className="mt-3 flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
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
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              This backup was made on <strong>{new Date(pendingRestore.exportedAt).toLocaleString()}</strong> and
              contains <strong>{countBackupItems(pendingRestore)}</strong> item{countBackupItems(pendingRestore) === 1 ? '' : 's'}.
              They'll be added into <strong>{user?.email}</strong> — anything already in your account stays as is,
              and items with the same ID as ones already in your account will be overwritten with the backup's version.
            </p>
            {restoreError && <p className="text-xs text-red-500 mb-4">{restoreError}</p>}
            {restoreStatus === 'done' ? (
              <div className="flex gap-3">
                <button
                  onClick={closeRestoreModal}
                  className="flex-1 bg-brand-600 hover:bg-brand-700 text-white py-2.5 rounded-lg text-sm font-medium"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={closeRestoreModal}
                  className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
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
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
          This will permanently delete <strong>all</strong> assets, liabilities, goals, transactions,
          and snapshots for <strong>{user?.email}</strong>. This action cannot be undone.
        </p>
        <label className="block mb-4">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 block">
            Type <strong>DELETE</strong> to confirm
          </span>
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder="DELETE"
            className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
          />
        </label>
        {status === 'error' && (
          <p className="text-xs text-red-500 mb-4">Something went wrong. Please try again.</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={closeModal}
            className="flex-1 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 py-2.5 rounded-lg text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteAll}
            disabled={confirmText !== 'DELETE' || status === 'deleting'}
            className="flex-1 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
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
  const [tab, setTab] = useUrlTab<Tab>(
    TABS.map((t) => t.key),
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : 'account'
  );

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
