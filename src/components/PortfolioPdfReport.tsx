import { useMemo } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { formatDateTime, formatDate, toIsoMonth } from '../utils/date';
import { useUiStore } from '../store/uiStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { resolveAssetValues } from '../utils/assetValues';
import { formatCurrency, ASSET_CLASS_LABELS, maskPreciseAmount } from '../utils/currency';
import { computePortfolioPnl } from '../utils/investmentPnl';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface PortfolioPdfReportProps {
  hideInPrint?: boolean;
  /** DOM id applied to the report's root element, so a caller (e.g. the
   *  export preview modal) can point html2canvas at exactly this node.
   *  Defaults to the id the rest of the app has historically used. */
  reportElementId?: string;
}

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

export const PortfolioPdfReport = ({
  hideInPrint = false,
  reportElementId = 'portfolio-pdf-report',
}: PortfolioPdfReportProps) => {
  const allAssets = useAssetsStore((s) => s.assets);
  const allLiabilities = useLiabilitiesStore((s) => s.liabilities);
  const allTransactions = useTransactionsStore((s) => s.transactions);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const liveGoldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const privacyMode = useUiStore((s) => s.privacyMode);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const profiles = useHouseholdProfilesStore((s) => s.profiles);
  const activeProfileName = activeProfileId
    ? profiles.find((p) => p.id === activeProfileId)?.name
    : undefined;

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

  const thisMonth = toIsoMonth();
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

  // Sold investments (fully closed-out holdings) + realized gains, so the
  // report shows the full lifecycle of a holding, not just what's currently
  // held. Scoped to the same currency the rest of this report is shown in.
  const portfolioPnl = useMemo(
    () => computePortfolioPnl(assets, 'INR', livePrices, sipValues, liveGoldPricePerGram),
    [assets, livePrices, sipValues, liveGoldPricePerGram]
  );
  const soldHoldings = portfolioPnl.sold;
  const totalRealizedPnl = portfolioPnl.realizedPnl;

  // Group liabilities by type
  const liabilitiesByType = useMemo(() => {
    const grouped: Record<string, { label: string; value: number; count: number }> = {};

    liabilities.forEach((l) => {
      const typeKey = l.liabilityClass || 'liability_other';
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
      id={reportElementId}
      className="w-full bg-white p-8 text-slate-900 print:p-0"
      style={{
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div className="mb-8 border-b-2 border-slate-200 pb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-brand-700 uppercase mb-1">AuraFin Holdings</p>
          <h1 className="text-4xl font-bold mb-2">Portfolio Report</h1>
          <p className="text-slate-600">
            {activeProfileName ? `${activeProfileName} · ` : ''}Generated on {formatDateTime(new Date())}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide">Net Worth</p>
          <p className="text-2xl font-bold">{maskPreciseAmount(netWorth, 'INR', privacyMode)}</p>
        </div>
      </div>

      {/* Table of contents — helps the reader jump straight to what they need */}
      <div className="mb-8 bg-slate-50 border border-slate-200 rounded-lg p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">In this report</p>
        <ol className="grid grid-cols-2 gap-y-1.5 text-sm text-slate-700 list-decimal list-inside">
          <li>Portfolio summary</li>
          <li>Monthly cashflow</li>
          {assetsByClass.length > 0 && <li>Asset breakdown</li>}
          {liabilitiesByType.length > 0 && <li>Liabilities</li>}
          {assets.length > 0 && <li>Current holdings (detailed)</li>}
          <li>Sold investments &amp; realized gains</li>
        </ol>
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
            <p className="text-xs text-slate-500 mt-2">Total assets minus liabilities</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Total Assets</p>
            <p className="text-3xl font-bold">
              {maskPreciseAmount(totalAssets, 'INR', privacyMode)}
            </p>
            <p className="text-xs text-slate-500 mt-2">{assets.length} asset{assets.length === 1 ? '' : 's'} currently held</p>
          </div>

          <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
            <p className="text-slate-600 text-sm font-semibold mb-2">Total Liabilities</p>
            <p className="text-3xl font-bold">
              {maskPreciseAmount(totalLiabilities, 'INR', privacyMode)}
            </p>
            <p className="text-xs text-slate-500 mt-2">{liabilities.length} liabilit{liabilities.length === 1 ? 'y' : 'ies'}</p>
          </div>

          <div className={`p-6 rounded-lg border-2 ${gainPercent >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
            <p className={`text-sm font-semibold mb-2 ${gainPercent >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              Unrealized Gain/Loss (current holdings)
            </p>
            <p className={`text-3xl font-bold ${gainPercent >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
              {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
            </p>
            <p className={`text-xs mt-2 ${gainPercent >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
              {maskPreciseAmount(gains, 'INR', privacyMode)}
            </p>
          </div>

          {soldHoldings.length > 0 && (
            <div className={`col-span-2 p-6 rounded-lg border-2 ${totalRealizedPnl >= 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
              <p className={`text-sm font-semibold mb-2 ${totalRealizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                Realized Gain/Loss (from sold investments)
              </p>
              <p className={`text-3xl font-bold ${totalRealizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {totalRealizedPnl >= 0 ? '+' : ''}{maskPreciseAmount(totalRealizedPnl, 'INR', privacyMode)}
              </p>
              <p className={`text-xs mt-2 ${totalRealizedPnl >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                Locked in from {soldHoldings.length} fully sold holding{soldHoldings.length === 1 ? '' : 's'} — see the Sold Investments section for details
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Cashflow Section */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-6">Monthly Cashflow ({toIsoMonth()})</h2>
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
            <p className={`text-3xl font-bold ${monthIncome - monthExpense >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
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
          <h2 className="text-2xl font-bold mb-1">Current Holdings</h2>
          <p className="text-sm text-slate-500 mb-6">Everything you currently hold, with live value and gain/loss against what you invested.</p>

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
                  <th className="text-right py-2 px-3 font-semibold">Gain/Loss %</th>
                </tr>
              </thead>
              <tbody>
                {assets.map((asset, i) => {
                  const assetValue = resolveAssetValues(asset, livePrices, sipValues, liveGoldPricePerGram);
                  const invested = assetValue.invested || assetValue.value;
                  const gain = assetValue.value - invested;
                  const gainPct = invested > 0 ? (gain / invested) * 100 : 0;

                  return (
                    <tr key={asset.id} className={`border-b border-slate-200 ${i % 2 === 1 ? 'bg-slate-50' : ''}`}>
                      <td className="py-2 px-3 font-medium">{asset.name}</td>
                      <td className="py-2 px-3">{ASSET_CLASS_LABELS[asset.assetClass] || asset.assetClass}</td>
                      <td className="text-right py-2 px-3">{asset.quantity?.toFixed(2) || '-'}</td>
                      <td className="text-right py-2 px-3 font-semibold">{formatCurrency(assetValue.value, 'INR')}</td>
                      <td className="text-right py-2 px-3">{formatCurrency(invested, 'INR')}</td>
                      <td className={`text-right py-2 px-3 font-semibold ${gain >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {gain >= 0 ? '+' : ''}{formatCurrency(gain, 'INR')}
                      </td>
                      <td className={`text-right py-2 px-3 font-semibold ${gain >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {gain >= 0 ? '+' : ''}{gainPct.toFixed(2)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 px-3" colSpan={3}>Total</td>
                  <td className="text-right py-2 px-3">{formatCurrency(totalAssets, 'INR')}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(investedAssetsTotal, 'INR')}</td>
                  <td className={`text-right py-2 px-3 ${gains >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {gains >= 0 ? '+' : ''}{formatCurrency(gains, 'INR')}
                  </td>
                  <td className={`text-right py-2 px-3 ${gains >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {gainPercent >= 0 ? '+' : ''}{gainPercent.toFixed(2)}%
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sold Investments (realized gains/losses) */}
      <div className="mb-8 page-break-before">
        <h2 className="text-2xl font-bold mb-1">Sold Investments</h2>
        <p className="text-sm text-slate-500 mb-6">
          Holdings you've completely exited — quantity sold, what it cost, what it sold for, and the profit or loss locked in.
        </p>

        {soldHoldings.length === 0 ? (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-6 text-sm text-slate-500">
            Nothing sold yet. Once you fully exit a holding, it will appear here with its realized gain or loss.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b-2 border-slate-300">
                  <th className="text-left py-2 px-3 font-semibold">Name</th>
                  <th className="text-left py-2 px-3 font-semibold">Class</th>
                  <th className="text-right py-2 px-3 font-semibold">Qty Sold</th>
                  <th className="text-right py-2 px-3 font-semibold">Avg Buy Price</th>
                  <th className="text-right py-2 px-3 font-semibold">Avg Sell Price</th>
                  <th className="text-right py-2 px-3 font-semibold">Cost of Sold</th>
                  <th className="text-right py-2 px-3 font-semibold">Sale Proceeds</th>
                  <th className="text-right py-2 px-3 font-semibold">Realized P&amp;L</th>
                  <th className="text-right py-2 px-3 font-semibold">Realized P&amp;L %</th>
                  <th className="text-right py-2 px-3 font-semibold">Last Sold</th>
                </tr>
              </thead>
              <tbody>
                {soldHoldings.map((h, i) => {
                  const avgSellPrice = h.totalSoldQty > 0 ? h.totalSaleProceeds / h.totalSoldQty : 0;
                  const lastSaleDate = h.sales.reduce<string | undefined>(
                    (latest, s) => (s.date && (!latest || s.date > latest) ? s.date : latest),
                    undefined
                  );
                  return (
                    <tr key={h.asset.id} className={`border-b border-slate-200 ${i % 2 === 1 ? 'bg-slate-50' : ''}`}>
                      <td className="py-2 px-3 font-medium">{h.asset.name}</td>
                      <td className="py-2 px-3">{ASSET_CLASS_LABELS[h.asset.assetClass] || h.asset.assetClass}</td>
                      <td className="text-right py-2 px-3">{h.totalSoldQty.toLocaleString(undefined, { maximumFractionDigits: 4 })} {h.unitLabel}</td>
                      <td className="text-right py-2 px-3">{formatCurrency(h.lifetimeAvgBuyCost, 'INR')}</td>
                      <td className="text-right py-2 px-3">{formatCurrency(avgSellPrice, 'INR')}</td>
                      <td className="text-right py-2 px-3">{formatCurrency(h.totalCostOfSold, 'INR')}</td>
                      <td className="text-right py-2 px-3 font-semibold">{formatCurrency(h.totalSaleProceeds, 'INR')}</td>
                      <td className={`text-right py-2 px-3 font-semibold ${h.realizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {h.realizedPnl >= 0 ? '+' : ''}{formatCurrency(h.realizedPnl, 'INR')}
                      </td>
                      <td className={`text-right py-2 px-3 font-semibold ${h.realizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                        {h.realizedPnlPercent !== undefined ? `${h.realizedPnlPercent >= 0 ? '+' : ''}${h.realizedPnlPercent.toFixed(2)}%` : '—'}
                      </td>
                      <td className="text-right py-2 px-3 text-slate-500">{lastSaleDate ? formatDate(lastSaleDate) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 font-semibold">
                  <td className="py-2 px-3" colSpan={5}>Total</td>
                  <td className="text-right py-2 px-3">{formatCurrency(soldHoldings.reduce((s, h) => s + h.totalCostOfSold, 0), 'INR')}</td>
                  <td className="text-right py-2 px-3">{formatCurrency(soldHoldings.reduce((s, h) => s + h.totalSaleProceeds, 0), 'INR')}</td>
                  <td className={`text-right py-2 px-3 ${totalRealizedPnl >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                    {totalRealizedPnl >= 0 ? '+' : ''}{formatCurrency(totalRealizedPnl, 'INR')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 border-t border-slate-200 text-xs text-slate-500">
        <p>This portfolio report is generated automatically by AuraFin Holdings and reflects data as of the moment it was generated.</p>
        <p>Amounts shown in INR. For the most up-to-date information, please visit your dashboard regularly.</p>
      </div>
    </div>
  );
};
