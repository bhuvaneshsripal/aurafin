import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useAssetsStore } from './store/assetsStore';
import { useLiabilitiesStore } from './store/liabilitiesStore';
import { useGoalsStore } from './store/goalsStore';
import { useTransactionsStore } from './store/transactionsStore';
import { useSnapshotsStore } from './store/snapshotsStore';
import { useUiStore } from './store/uiStore';
import { useFirestoreCollectionSync } from './hooks/useFirestoreSync';
import { useLivePrices } from './hooks/useLivePrices';
import Sidebar from './components/Sidebar';
import Topbar from './components/Topbar';
import BottomNav from './components/BottomNav';
import Dashboard from './pages/Dashboard';
import Wealth from './pages/Wealth';
import Essentials from './pages/Essentials';
import Transactions from './pages/Transactions';
import Import from './pages/Import';
import Calculators from './pages/Calculators';
import Settings from './pages/Settings';
import WhatsNew from './pages/WhatsNew';
import InstallApp from './pages/InstallApp';
import Feedback from './pages/Feedback';
import Login from './pages/Login';
import type { Asset, Liability, Goal, Transaction, Snapshot } from './types';

function AppShell() {
  return (
    <div className="flex min-h-screen bg-cream-100 dark:bg-slate-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar />
        <main className="flex-1 p-4 pb-36 sm:p-6 sm:pb-36 md:p-8 md:pb-8 max-w-6xl mx-auto w-full">
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
        </main>
      </div>
      <BottomNav />
    </div>
  );
}

function LivePriceSync() {
  useLivePrices();
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

  useEffect(() => {
    init();
    initTheme();
  }, [init, initTheme]);

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
