import { useMemo } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useUiStore } from '../store/uiStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { resolveAssetValues } from '../utils/assetValues';
import { formatCurrency, ASSET_CLASS_LABELS, maskPreciseAmount } from '../utils/currency';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface PortfolioPdfReportProps {
  hideInPrint?: boolean;
}

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

const ASSET_COLORS: Record<string, string> = {
  stock: '#3B82F6',
  etf: '#8B5CF6',
  equity_mutual_fund: '#EC4899',
  index_fund: '#F59E0B',
  hybrid_mutual_fund: '#10B981',
  sip: '#06B6D4',
  fixed_deposit: '#6366F1',
  gold: '#FBBF24',
  real_estate: '#F87171',
  insurance: '#A78BFA',
  bank_account: '#34D399',
  crypto_coin: '#F3A461',
  cash: '#94A3B8',
  bond: '#60A5FA',
  international_equity: '#34D399',
  ipo_pre_ipo: '#A855F7',
  esop_rsu: '#F43F5E',
  equity_other: '#818CF8',
  liability_credit_card: '#EF4444',
  liability_loan: '#F97316',
  liability_other: '#D97706',
  nft: '#EC4899',
};

export const PortfolioPdfReport = ({ hideInPrint = false }: PortfolioPdfReportProps) => {
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  // Filter by active profile
  const assets = activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets;
  const liabilities = activeProfileId
    ? allLiabilities.filter((l) => l.profileId === activeProfileId)
    : allLiabilities;
  const transactions = activeProfileId
    ? allTransactions.filter((t) => t.profileId === activeProfileId)
    : allTransactions;

  // Calculate portfolio metrics
  const totalAssets = useMemo(
    () =>
      assets.reduce(
        (s, a) => s + resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value,
        0
      ),
    [assets, livePrices, sipValues, liveGoldPricePerGram]
  );

  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + l.outstanding, 0), [liabilities]);

  const netWorth = totalAssets - totalLiabilities;

  const investedAssetsTotal = useMemo(
    () =>
      assets.reduce(
        (s, a) => s + (resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).invested ?? a.value),
        0
      ),
    [assets, livePrices, sipValues, liveGoldPricePerGram]
  );

  const gains = totalAssets - investedAssetsTotal;
  const gainPercent = investedAssetsTotal > 0 ? (gains / investedAssetsTotal) * 100 : 0;

  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthIncome = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'income' && t.date.startsWith(thisMonth))
        .reduce((s, t) => s + t.amount, 0),
    [transactions, thisMonth]
  );

  const monthExpense = useMemo(
    () =>
      transactions
        .filter((t) => t.type === 'expense' && t.date.startsWith(thisMonth))
        .reduce((s, t) => s + t.amount, 0),
    [transactions, thisMonth]
  );

  // Group assets by class
  const assetsByClass = useMemo(() => {
    const grouped: Record<string, { label: string; value: number; count: number }> = {};

    assets.forEach((a) => {
      const classKey = a.assetClass;
      const assetValue = resolveAssetValues(a, livePrices, sipValues, liveGoldPricePerGram).value;

      if (!grouped[classKey]) {
        grouped[classKey] = {
          label: ASSET_CLASS_LABELS[classKey] || classKey,
          value: 0,
          count: 0,
        };
      }
      grouped[classKey].value += assetValue;
      grouped[classKey].count += 1;
    });

    return Object.entries(grouped).map(([key, data]) => ({
      name: data.label,
      value: Math.round(data.value),
      count: data.count,
      assetClass: key,
    }));
  }, [assets, livePrices, sipValues, liveGoldPricePerGram]);

  // Group liabilities by type
  const liabilitiesByType = useMemo(() => {
    const grouped: Record<string, { label: string; value: number; count: number }> = {};

    liabilities.forEach((l) => {
      const typeKey = l.type;
      if (!grouped[typeKey]) {
        grouped[typeKey] = {
          label: ASSET_CLASS_LABELS[typeKey] || typeKey,
          value: 0,
          count: 0,
        };
      }
      grouped[typeKey].value += l.outstanding;
      grouped[typeKey].count += 1;
    });

    return Object.entries(grouped).map(([key, data]) => ({
      name: data.label,
      value: Math.round(data.value),
      count: data.count,
      type: key,
    }));
  }, [liabilities]);

  if (hideInPrint) {
    return null;
  }

  return (
    <div
      id="portfolio-pdf-report"
      className="w-full bg-white p-8 text-slate-900 print:p-0"
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div className="mb-8 border-b-2 border-slate-200 pb-6">
        <h1 className="text-4xl font-bold mb-2">Portfolio Report</h1>
        <p className="text-slate-600">Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</p>
      </div>

      {/* Summary Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-6">Portfolio Summary</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Net Worth</p>
            <p className="text-3xl font-bold">
              {maskPreciseAmount(netWorth, 'INR', privacyMode)}
            </p>
            <p className="text-xs text-slate-500 mt-2">Total Assets - Liabilities</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Total Assets</p>
            <p className="text-3xl font-bold">
              {maskPreciseAmount(totalAssets, 'INR', privacyMode)}
            </p>
            <p className="text-xs text-slate-500 mt-2">{assets.length} assets</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Total Liabilities</p>
            <p className="text-3xl font-bold">
              {maskPreciseAmount(totalLiabilities, 'INR', privacyMode)}
            </p>
            <p className="text-xs text-slate-500 mt-2">{liabilities.length} liabilities</p>
          </div>

          <div className={`p-6 rounded-lg border-2 ${gainPercent >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-sm font-semibold mb-2 ${gainPercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              Overall Gain/Loss
            </p>
            <p className={`text-3xl font-bold ${gainPercent >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
            </p>
            <p className={`text-xs mt-2 ${gainPercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {maskPreciseAmount(gains, 'INR', privacyMode)}
            </p>
          </div>
        </div>
      </div>

      {/* Cashflow Section */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-6">Monthly Cashflow ({new Date().toISOString().slice(0, 7)})</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-blue-50 p-6 rounded-lg border border-blue-200">
            <p className="text-blue-700 text-sm font-semibold mb-2">Income</p>
            <p className="text-3xl font-bold text-blue-900">
              {maskPreciseAmount(monthIncome, 'INR', privacyMode)}
            </p>
          </div>

          <div className="bg-orange-50 p-6 rounded-lg border border-orange-200">
            <p className="text-orange-700 text-sm font-semibold mb-2">Expenses</p>
            <p className="text-3xl font-bold text-orange-900">
              {maskPreciseAmount(monthExpense, 'INR', privacyMode)}
            </p>
          </div>

          <div className="col-span-2 bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Net Cashflow</p>
            <p className={`text-3xl font-bold ${monthIncome - monthExpense >= 0 ? 'text-green-700' : 'text-red-700'}`}>
              {maskPreciseAmount(monthIncome - monthExpense, 'INR', privacyMode)}
            </p>
          </div>
        </div>
      </div>

      {/* Asset Breakdown Charts */}
      {assetsByClass.length > 0 && (
        <div className="mb-8 page-break-before">
          <h2 className="text-2xl font-bold mb-6">Asset Breakdown</h2>

          {/* Pie Chart */}
          <div className="mb-8 flex justify-center">
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={assetsByClass}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name}: ${formatCurrency(value, 'INR')}`}
                  outerRadius={150}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {assetsByClass.map((entry) => (
                    <Cell key={`cell-${entry.assetClass}`} fill={ASSET_COLORS[entry.assetClass] || '#94A3B8'} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(value as number, 'INR')} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Asset Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-3 px-4 font-semibold">Asset Class</th>
                  <th className="text-right py-3 px-4 font-semibold">Value</th>
                  <th className="text-right py-3 px-4 font-semibold">% of Portfolio</th>
                  <th className="text-center py-3 px-4 font-semibold">Count</th>
                </tr>
              </thead>
              <tbody>
                {assetsByClass.map((asset) => (
                  <tr key={asset.assetClass} className="border-b border-slate-200">
                    <td className="py-3 px-4">{asset.name}</td>
                    <td className="text-right py-3 px-4 font-semibold">{formatCurrency(asset.value, 'INR')}</td>
                    <td className="text-right py-3 px-4">{((asset.value / totalAssets) * 100).toFixed(2)}%</td>
                    <td className="text-center py-3 px-4">{asset.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Liabilities Section */}
      {liabilitiesByType.length > 0 && (
        <div className="mb-8 page-break-before">
          <h2 className="text-2xl font-bold mb-6">Liabilities</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-3 px-4 font-semibold">Type</th>
                  <th className="text-right py-3 px-4 font-semibold">Amount</th>
                  <th className="text-right py-3 px-4 font-semibold">% of Total Assets</th>
                  <th className="text-center py-3 px-4 font-semibold">Count</th>
                </tr>
              </thead>
              <tbody>
                {liabilitiesByType.map((liability) => (
                  <tr key={liability.type} className="border-b border-slate-200">
                    <td className="py-3 px-4">{liability.name}</td>
                    <td className="text-right py-3 px-4 font-semibold">{formatCurrency(liability.value, 'INR')}</td>
                    <td className="text-right py-3 px-4">{((liability.value / totalAssets) * 100).toFixed(2)}%</td>
                    <td className="text-center py-3 px-4">{liability.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detailed Assets List */}
      {assets.length > 0 && (
        <div className="mb-8 page-break-before">
          <h2 className="text-2xl font-bold mb-6">Detailed Assets</h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-2 px-3 font-semibold">Name</th>
                  <th className="text-left py-2 px-3 font-semibold">Class</th>
                  <th className="text-right py-2 px-3 font-semibold">Quantity</th>
                  <th className="text-right py-2 px-3 font-semibold">Current Value</th>
                  <th className="text-right py-2 px-3 font-semibold">Invested</th>
                  <th className="text-right py-2 px-3 font-semibold">Gain/Loss</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset) => {
                  const assetValue = resolveAssetValues(asset, livePrices, sipValues, liveGoldPricePerGram);
                  const gain = assetValue.value - (assetValue.invested || assetValue.value);

                  return (
                    <tr key={asset.id} className="border-b border-slate-200">
                      <td className="py-2 px-3">{asset.name}</td>
                      <td className="py-2 px-3">{ASSET_CLASS_LABELS[asset.assetClass] || asset.assetClass}</td>
                      <td className="text-right py-2 px-3">{asset.quantity?.toFixed(2) || '-'}</td>
                      <td className="text-right py-2 px-3 font-semibold">{formatCurrency(assetValue.value, 'INR')}</td>
                      <td className="text-right py-2 px-3">{formatCurrency(assetValue.invested || assetValue.value, 'INR')}</td>
                      <td className={`text-right py-2 px-3 font-semibold ${gain >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {gain >= 0 ? '+' : ''}{formatCurrency(gain, 'INR')}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500">
        <p>This portfolio report is generated automatically by AuraFin Holdings.</p>
        <p>For the most up-to-date information, please visit your dashboard regularly.</p>
      </div>
    </div>
  );
};
