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
import { useUiStore } from './store/uiStore';
import { useAppLockStore } from './store/appLockStore';
import { useFirestoreCollectionSync } from './hooks/useFirestoreSync';
import { useLivePrices } from './hooks/useLivePrices';
import { useLiveSipValues } from './hooks/useLiveSipValues';
import { useLiveGoldPrice } from './hooks/useLiveGoldPrice';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import PrivacyFab from './components/PrivacyFab';
import LockScreen from './components/LockScreen';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import { lazyWithRetry } from './utils/lazyWithRetry';
import type { Asset, Liability, Goal, Transaction, Snapshot, BudgetItem, FinancialProfile } from './types';

const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Wealth = lazyWithRetry(() => import('./pages/Wealth'));
const Essentials = lazyWithRetry(() => import('./pages/Essentials'));
const Transactions = lazyWithRetry(() => import('./pages/Transactions'));
const Import = lazyWithRetry(() => import('./pages/Import'));
const Calculators = lazyWithRetry(() => import('./pages/Calculators'));
const Settings = lazyWithRetry(() => import('./pages/Settings'));
const WhatsNew = lazyWithRetry(() => import('./pages/WhatsNew'));
const InstallApp = lazyWithRetry(() => import('./pages/InstallApp'));
const Feedback = lazyWithRetry(() => import('./pages/Feedback'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
  );
}

function AppShell() {
  const location = useLocation();
  return (
    <div className="flex min-h-screen bg-cream-100 dark:bg-slate-950">
      <LockScreen />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 pb-36 sm:p-6 sm:pb-36 md:p-8 md:pb-8 max-w-6xl mx-auto w-full">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/wealth" element={<Wealth />} />
                <Route path="/essentials" element={<Essentials />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/import" element={<Import />} />
                <Route path="/calculators" element={<Calculators />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/whats-new" element={<WhatsNew />} />
                <Route path="/install" element={<InstallApp />} />
                <Route path="/feedback" element={<Feedback />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      <BottomNav />
      <PrivacyFab />
    </div>
  );
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

  useFirestoreCollectionSync<Asset>('assets', setAssets);
  useFirestoreCollectionSync<Liability>('liabilities', setLiabilities);
  useFirestoreCollectionSync<Goal>('goals', setGoals);
  useFirestoreCollectionSync<Transaction>('transactions', setTransactions);
  useFirestoreCollectionSync<Snapshot>('snapshots', setSnapshots);
  useFirestoreCollectionSync<BudgetItem>('budgets', setBudgetItems);
  useFirestoreCollectionSync<FinancialProfile>('financialProfile', setFinancialProfile);

  return null;
}

export default function App() {
  const { user, loading, init } = useAuthStore();
  const initTheme = useUiStore((s) => s.initTheme);
  const initPrivacy = useUiStore((s) => s.initPrivacy);
  const initLock = useAppLockStore((s) => s.init);

  useEffect(() => {
    init();
    initTheme();
    initPrivacy();
    initLock();
  }, [init, initTheme, initPrivacy, initLock]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 text-base">
        Loading...
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <DataSync />
      <LivePriceSync />
      <AppShell />
    </BrowserRouter>
  );
}
