/**
 * EXAMPLE: Dashboard Integration with PDF Export
 * 
 * This file shows the minimal changes needed to integrate the PDF export feature
 * into the existing Dashboard component.
 * 
 * Steps:
 * 1. Add the new imports
 * 2. Add the exportModalOpen state
 * 3. Add the export button in the JSX
 * 4. Add the modal and report components at the end
 */

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ChevronRight, Scale, ArrowLeftRight, TrendingUp, Target, Download } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useGoalsStore } from '../store/goalsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import Amount from '../components/Amount';
import LoadingDots from '../components/LoadingDots';
import GoldPriceCard from '../components/GoldPriceCard';
import { ASSET_CLASS_LABELS, formatCurrency, maskPreciseAmount } from '../utils/currency';
import { resolveAssetValues } from '../utils/assetValues';

// ========== NEW IMPORTS FOR PDF EXPORT ==========
import { PortfolioPdfReport } from '../components/PortfolioPdfReport';
import { PortfolioExportModal } from '../components/PortfolioExportModal';
// ===============================================

const INVESTMENT_CLASSES = new Set([
  'stock',
  'etf',
  'equity_mutual_fund',
  'index_fund',
  'hybrid_mutual_fund',
  'sip',
  'international_equity',
  'ipo_pre_ipo',
  'esop_rsu',
  'equity_other',
  'crypto_coin',
  'nft',
]);

export default function Dashboard() {
  // ========== NEW STATE FOR PDF EXPORT ==========
  const [exportModalOpen, setExportModalOpen] = useState(false);
  // =============================================

  const [cashflowOpen, setCashflowOpen] = useState(false);
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const allGoals = useGoalsStore((s) => s.goals);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const sipValuesAttempted = useLivePricesStore((s) => s.sipValuesAttempted);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const assetsServerConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  const liabilitiesServerConfirmed = useSyncStatusStore((s) => s.liabilitiesServerConfirmed);
  const transactionsServerConfirmed = useSyncStatusStore((s) => s.transactionsServerConfirmed);
  const goalsServerConfirmed = useSyncStatusStore((s) => s.goalsServerConfirmed);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  // ... rest of existing state management ...

  return (
    <div className="space-y-6">
      {/* ========== NEW: HEADER WITH EXPORT BUTTON ========== */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">Welcome back! Here's your wealth overview.</p>
        </div>
        <button
          onClick={() => setExportModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-brand-600 hover:bg-brand-700 active:bg-brand-800 rounded-lg transition-colors shadow-sm"
          title="Export portfolio as PDF"
        >
          <Download size={16} />
          Export Portfolio
        </button>
      </div>
      {/* ==================================================== */}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          {/* Existing Net Worth card */}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
          {/* Existing Invested card */}
        </div>
      </div>

      <GoldPriceCard />

      {/* ... rest of existing dashboard content ... */}

      {/* ========== NEW: EXPORT MODAL AND HIDDEN REPORT ========== */}
      <PortfolioExportModal 
        isOpen={exportModalOpen} 
        onClose={() => setExportModalOpen(false)} 
      />

      {/* 
        Hidden report component - rendered but not visible
        Used only for PDF generation
      */}
      <div style={{ display: 'none' }}>
        <PortfolioPdfReport hideInPrint={false} />
      </div>
      {/* ======================================================== */}
    </div>
  );
}

/**
 * INTEGRATION CHECKLIST:
 * 
 * ✓ Import Download icon from lucide-react
 * ✓ Import PortfolioPdfReport component
 * ✓ Import PortfolioExportModal component
 * ✓ Add exportModalOpen state
 * ✓ Add export button in header
 * ✓ Add PortfolioExportModal component
 * ✓ Add hidden PortfolioPdfReport component
 * 
 * NEXT STEPS:
 * 1. Install dependencies: npm install
 * 2. Copy this integration into your actual Dashboard.tsx
 * 3. Test the export functionality
 * 4. Customize styling if needed
 */
