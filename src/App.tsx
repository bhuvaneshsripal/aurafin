import { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAssetsStore } from './store/assetsStore';
import { useLiabilitiesStore } from './store/liabilitiesStore';
import { useGoalsStore } from './store/goalsStore';
import { useTransactionsStore } from './store/transactionsStore';
import { useSnapshotsStore } from './store/snapshotsStore';
import { useUiStore } from './store/uiStore';
import { useAppLockStore } from './store/appLockStore';
import { useFirestoreCollectionSync } from './hooks/useFirestoreSync';
import { useLivePrices } from './hooks/useLivePrices';
import { useLiveSipValues } from './hooks/useLiveSipValues';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import LockScreen from './components/LockScreen';
import Login from './pages/Login';
import type { Asset, Liability, Goal, Transaction, Snapshot } from './types';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Wealth = lazy(() => import('./pages/Wealth'));
const Essentials = lazy(() => import('./pages/Essentials'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Import = lazy(() => import('./pages/Import'));
const Calculators = lazy(() => import('./pages/Calculators'));
const Settings = lazy(() => import('./pages/Settings'));
const WhatsNew = lazy(() => import('./pages/WhatsNew'));
const InstallApp = lazy(() => import('./pages/InstallApp'));
const Feedback = lazy(() => import('./pages/Feedback'));

function RouteFallback() {
  return (
    <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
  );
}

function AppShell() {
  return (
    <div className="flex min-h-screen bg-cream-100 dark:bg-slate-950">
      <LockScreen />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 pb-36 sm:p-6 sm:pb-36 md:p-8 md:pb-8 max-w-6xl mx-auto w-full">
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
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function LivePriceSync() {
  useLivePrices();
  useLiveSipValues();
  return null;
}

function DataSync() {
  const setAssets = useAssetsStore((s) => s.setAssets);
  const setLiabilities = useLiabilitiesStore((s) => s.setLiabilities);
  const setGoals = useGoalsStore((s) => s.setGoals);
  const setTransactions = useTransactionsStore((s) => s.setTransactions);
  const setSnapshots = useSnapshotsStore((s) => s.setSnapshots);

  useFirestoreCollectionSync<Asset>('assets', setAssets);
  useFirestoreCollectionSync<Liability>('liabilities', setLiabilities);
  useFirestoreCollectionSync<Goal>('goals', setGoals);
  useFirestoreCollectionSync<Transaction>('transactions', setTransactions);
  useFirestoreCollectionSync<Snapshot>('snapshots', setSnapshots);

  return null;
}

export default function App() {
  const { user, loading, init } = useAuthStore();
  const initTheme = useUiStore((s) => s.initTheme);
  const initLock = useAppLockStore((s) => s.init);

  useEffect(() => {
    init();
    initTheme();
    initLock();
  }, [init, initTheme, initLock]);

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
