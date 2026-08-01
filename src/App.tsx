import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAssetsStore } from './store/assetsStore';
import { useLiabilitiesStore } from './store/liabilitiesStore';
import { useGoalsStore } from './store/goalsStore';
import { useTransactionsStore } from './store/transactionsStore';
import { useSnapshotsStore } from './store/snapshotsStore';
import { useBudgetStore } from './store/budgetStore';
import { useFinancialProfileStore } from './store/financialProfileStore';
import { useSyncStatusStore } from './store/syncStatusStore';
import { useHouseholdProfilesStore } from './store/householdProfilesStore';
import { usePremiumStore } from './store/premiumStore';
import { useUiStore } from './store/uiStore';
import { useAppLockStore } from './store/appLockStore';
import { useDisplaySettingsStore } from './store/displaySettingsStore';
import { useInstallPromptStore } from './store/installPromptStore';
import { useFirestoreCollectionSync, useAvatarSync, assignOrphanDataToProfile } from './hooks/useFirestoreSync';
import { useLivePrices } from './hooks/useLivePrices';
import { useLiveSipValues } from './hooks/useLiveSipValues';
import { useLiveGoldPrice } from './hooks/useLiveGoldPrice';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import PrivacyFab from './components/PrivacyFab';
import LockScreen from './components/LockScreen';
import InstallPromptModal from './components/InstallPromptModal';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingScreen from './components/LoadingScreen';
import Login from './pages/Login';
import { lazyWithRetry } from './utils/lazyWithRetry';
import type { Asset, Liability, Goal, Transaction, Snapshot, BudgetItem, FinancialProfile, HouseholdProfile, PremiumStatus } from './types';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Wealth = lazyWithRetry(() => import('./pages/Wealth'));
const Essentials = lazyWithRetry(() => import('./pages/Essentials'));
const Transactions = lazyWithRetry(() => import('./pages/Transactions'));
const Import = lazyWithRetry(() => import('./pages/Import'));
const Calculators = lazyWithRetry(() => import('./pages/Calculators'));
const Pro = lazyWithRetry(() => import('./pages/Pro'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const WhatsNew = lazyWithRetry(() => import('./pages/WhatsNew'));
const InstallApp = lazyWithRetry(() => import('./pages/InstallApp'));
const Feedback = lazyWithRetry(() => import('./pages/Feedback'));
const Onboarding = lazyWithRetry(() => import('./pages/Onboarding'));

function RouteFallback() {
  return <LoadingScreen fullScreen={false} />;
}

function AppShell() {
  const location = useLocation();
  const needsOnboarding = useAuthStore((s) => s.needsOnboarding);

  // First-time sign-ups/sign-ins get the full-screen onboarding wizard with
  // none of the normal chrome (sidebar/topbar/bottom nav) — matches how
  // Login is rendered outside the shell. Any route they try to hit while
  // onboarding is pending bounces back to /onboarding.
  if (needsOnboarding) {
    return (
      <ErrorBoundary key="onboarding">
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="*" element={<Navigate to="/onboarding" replace />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex min-h-screen bg-cream-100 dark:bg-slate-950">
      <LockScreen />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 app-scale">
        <Topbar />
        <main className="flex-1 p-4 pb-36 sm:p-6 sm:pb-36 md:p-8 md:pb-8 max-w-6xl mx-auto w-full">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <div key={location.pathname} className="animate-page-in">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/wealth" element={<Wealth />} />
                  <Route path="/essentials" element={<Essentials />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/import" element={<Import />} />
                  <Route path="/calculators" element={<Calculators />} />
                  <Route path="/pro" element={<Pro />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="/whats-new" element={<WhatsNew />} />
                  <Route path="/install" element={<InstallApp />} />
                  <Route path="/feedback" element={<Feedback />} />
                  <Route path="/onboarding" element={<Navigate to="/" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <PrivacyFab />
      <InstallPromptModal />
    </div>
  );
}

function InstallPromptListener() {
  const setDeferredPrompt = useInstallPromptStore((s) => s.setDeferredPrompt);
  const setInstalled = useInstallPromptStore((s) => s.setInstalled);

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
  }, [setDeferredPrompt, setInstalled]);

  return null;
}

function LivePriceSync() {
  useLivePrices();
  useLiveSipValues();
  useLiveGoldPrice();
  return null;
}

function DataSync() {
  const setAssets = useAssetsStore((s) => s.setAssets);
  const setLiabilities = useLiabilitiesStore((s) => s.setLiabilities);
  const setGoals = useGoalsStore((s) => s.setGoals);
  const setTransactions = useTransactionsStore((s) => s.setTransactions);
  const setSnapshots = useSnapshotsStore((s) => s.setSnapshots);
  const setBudgetItems = useBudgetStore((s) => s.setItems);
  const setFinancialProfile = useFinancialProfileStore((s) => s.setItems);
  const setHouseholdProfiles = useHouseholdProfilesStore((s) => s.setProfiles);
  const setPremiumItems = usePremiumStore((s) => s.setItems);
  const setAssetsSynced = useSyncStatusStore((s) => s.setAssetsSynced);
  const setLiabilitiesSynced = useSyncStatusStore((s) => s.setLiabilitiesSynced);

  useFirestoreCollectionSync<Asset>('assets', setAssets, setAssetsSynced);
  useFirestoreCollectionSync<Liability>('liabilities', setLiabilities, setLiabilitiesSynced);
  useFirestoreCollectionSync<Goal>('goals', setGoals);
  useFirestoreCollectionSync<Transaction>('transactions', setTransactions);
  useFirestoreCollectionSync<Snapshot>('snapshots', setSnapshots);
  useFirestoreCollectionSync<BudgetItem>('budgets', setBudgetItems);
  useFirestoreCollectionSync<FinancialProfile>('financialProfile', setFinancialProfile);
  useFirestoreCollectionSync<HouseholdProfile>('profiles', setHouseholdProfiles);
  useFirestoreCollectionSync<PremiumStatus>('premium', setPremiumItems);
  useAvatarSync();

  // One-time backfill: data created before household profiles existed has
  // no profileId. While there's exactly one profile, "whose data is this"
  // is unambiguous, so quietly tag any orphaned records with it. This stops
  // being safe (and stops running) the moment a second profile is added.
  const user = useAuthStore((s) => s.user);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const goals = useGoalsStore((s) => s.goals);
  const transactions = useTransactionsStore((s) => s.transactions);

  useEffect(() => {
    if (!user || profiles.length !== 1) return;
    const soleProfileId = profiles[0].id;
    assignOrphanDataToProfile(user.uid, 'assets', assets, soleProfileId);
    assignOrphanDataToProfile(user.uid, 'liabilities', liabilities, soleProfileId);
    assignOrphanDataToProfile(user.uid, 'goals', goals, soleProfileId);
    assignOrphanDataToProfile(user.uid, 'transactions', transactions, soleProfileId);
  }, [user, profiles, assets, liabilities, goals, transactions]);

  // Offline-safe fallback: if the server never confirms (no connection),
  // don't leave the Net Worth figure in a skeleton state forever — show
  // whatever the cache has after a few seconds.
  useEffect(() => {
    const timer = setTimeout(() => {
      setAssetsSynced(false);
      setLiabilitiesSynced(false);
    }, 4000);
    return () => clearTimeout(timer);
  }, [setAssetsSynced, setLiabilitiesSynced]);

  return null;
}

export default function App() {
  const { user, loading, init } = useAuthStore();
  const initTheme = useUiStore((s) => s.initTheme);
  const initPrivacy = useUiStore((s) => s.initPrivacy);
  const initLock = useAppLockStore((s) => s.init);
  const initDisplaySettings = useDisplaySettingsStore((s) => s.init);

  useEffect(() => {
    init();
    initTheme();
    initPrivacy();
    initLock();
    initDisplaySettings();
  }, [init, initTheme, initPrivacy, initLock, initDisplaySettings]);

  if (loading) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <DataSync />
      <LivePriceSync />
      <InstallPromptListener />
      <AppShell />
    </BrowserRouter>
  );
}
