import { useRef, useState } from 'react';
import {
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  FileText,
} from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { bulkUpsertDocs } from '../hooks/useFirestoreSync';
import { parseSpreadsheetFile, rowsToAssets, type ParsedRow } from '../utils/importParser';
import { formatCurrency, formatPreciseCurrency } from '../utils/currency';
import { ASSET_TAXONOMY } from '../utils/taxonomy';
import { exportToCsv, exportToXlsx, IMPORT_TEMPLATE_ROWS } from '../utils/exportCsv';
import type { AssetClass } from '../types';

interface Broker {
  key: string;
  name: string;
  initial: string;
  color: string;
  steps: { title: string; items: string[] }[];
}

function genericSteps(name: string): { title: string; items: string[] }[] {
  return [
    {
      title: `Export from ${name}`,
      items: [
        `Login to your ${name} account`,
        'Go to your Portfolio or Holdings page',
        'Look for an export/download option (CSV or Excel)',
        'Upload the downloaded file below',
      ],
    },
  ];
}

const BROKERS: Broker[] = [
  {
    key: 'zerodha',
    name: 'Zerodha',
    initial: 'Z',
    color: '#387ed1',
    steps: [
      {
        title: 'Option 1: Kite Web (CSV)',
        items: [
          'Login to kite.zerodha.com',
          'Go to Holdings',
          'Click the download icon to download the CSV file',
          'Upload the downloaded file below',
        ],
      },
      {
        title: 'Option 2: Console (XLSX)',
        items: [
          'Login to console.zerodha.com',
          'Go to Portfolio → Holdings',
          'Click Export',
          'Upload the downloaded file below',
        ],
      },
    ],
  },
  {
    key: 'groww',
    name: 'Groww',
    initial: 'G',
    color: '#00d09c',
    steps: [
      {
        title: 'Export from Groww',
        items: [
          'Open the Groww app or website',
          'Go to Stocks / Mutual Funds → Holdings',
          'Tap the export/download icon',
          'Upload the downloaded file below',
        ],
      },
    ],
  },
  {
    key: 'indmoney',
    name: 'INDmoney',
    initial: 'I',
    color: '#00b386',
    steps: genericSteps('INDmoney'),
  },
  { key: 'upstox', name: 'Upstox', initial: 'U', color: '#5e2b97', steps: genericSteps('Upstox') },
  {
    key: 'icici',
    name: 'ICICI Direct',
    initial: 'I',
    color: '#e2711d',
    steps: genericSteps('ICICI Direct'),
  },
  { key: 'cdsl', name: 'CDSL', initial: 'C', color: '#1e40af', steps: genericSteps('CDSL') },
  { key: 'angelone', name: 'Angel One', initial: 'A', color: '#e64a19', steps: genericSteps('Angel One') },
  { key: 'aionion', name: 'Aionion', initial: 'A', color: '#16a34a', steps: genericSteps('Aionion') },
  {
    key: 'chola',
    name: 'Chola Securities',
    initial: '+',
    color: '#7c3aed',
    steps: genericSteps('Chola Securities'),
  },
  { key: 'mstock', name: 'mstock', initial: 'M', color: '#ea580c', steps: genericSteps('mstock') },
  { key: '5paisa', name: '5paisa', initial: '5p', color: '#0891b2', steps: genericSteps('5paisa') },
  { key: 'vested', name: 'Vested', initial: 'V', color: '#059669', steps: genericSteps('Vested') },
  {
    key: 'tickertape',
    name: 'Tickertape',
    initial: 'T',
    color: '#d97706',
    steps: genericSteps('Tickertape'),
  },
  { key: 'stockal', name: 'Stockal', initial: 'St', color: '#dc2626', steps: genericSteps('Stockal') },
  {
    key: 'ibkr',
    name: 'Interactive Brokers',
    initial: 'IB',
    color: '#b91c1c',
    steps: genericSteps('Interactive Brokers'),
  },
  { key: 'kuvera', name: 'Kuvera', initial: 'K', color: '#7c3aed', steps: genericSteps('Kuvera') },
  {
    key: 'mfcentral',
    name: 'MFCentral CAS',
    initial: 'M',
    color: '#1d4ed8',
    steps: [
      {
        title: 'Export your CAS from MFCentral',
        items: [
          'Login to mfcentral.com',
          'Go to Statements → Consolidated Account Statement',
          'Request and download your CAS (PDF/XLSX)',
          'Upload the downloaded file below',
        ],
      },
    ],
  },
];

export default function Import() {
  const user = useAuthStore((s) => s.user);
  const existingAssets = useAssetsStore((s) => s.assets);
  const [importTab, setImportTab] = useState<'broker' | 'standard'>('broker');
  const [selectedBroker, setSelectedBroker] = useState<Broker>(BROKERS[0]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'saving' | 'done' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');
  // On by default: re-importing the same weekly broker export should update
  // each holding's price/quantity/value in place, not pile up a duplicate
  // for every past week's file.
  const [matchExisting, setMatchExisting] = useState(true);
  const [importResult, setImportResult] = useState<{ updated: number; added: number } | null>(null);

  const handleFile = async (file: File) => {
    setStatus('parsing');
    setErrorMsg('');
    setFileName(file.name);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.length === 0) {
        setStatus('error');
        setErrorMsg('No rows found in that file.');
        return;
      }
      setRows(parsed);
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const updateRowClass = (index: number, assetClass: AssetClass) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, assetClass } : r)));
  };

  const removeRow = (index: number) => {
    setRows((prev) => prev.filter((_, i) => i !== index));
  };

  const validRows = rows.filter((r) => r.valid);
  const totalValue = validRows.reduce((s, r) => s + r.value, 0);
  const preview = rowsToAssets(validRows, existingAssets, matchExisting);

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setStatus('saving');
    try {
      const { assets, updatedCount, addedCount } = rowsToAssets(rows, existingAssets, matchExisting);
      await bulkUpsertDocs(user.uid, 'assets', assets);
      setImportResult({ updated: updatedCount, added: addedCount });
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not save assets.');
    }
  };

  const reset = () => {
    setRows([]);
    setFileName('');
    setStatus('idle');
    setErrorMsg('');
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Import</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Bulk import assets, income &amp; expenses</p>
      </div>

      {status === 'idle' && (
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 max-w-sm">
          <button
            onClick={() => setImportTab('broker')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              importTab === 'broker'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Import from Broker
          </button>
          <button
            onClick={() => setImportTab('standard')}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              importTab === 'standard'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            Standard Import
          </button>
        </div>
      )}

      {status === 'idle' && importTab === 'broker' && (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h3 className="font-semibold text-slate-900 dark:text-white">Select Broker</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {BROKERS.map((b) => (
                <button
                  key={b.key}
                  onClick={() => setSelectedBroker(b)}
                  className={`flex items-center gap-2 border rounded-xl px-3 py-3 text-sm font-medium transition-colors ${
                    selectedBroker.key === b.key
                      ? 'border-brand-500 dark:border-brand-600 bg-brand-50 dark:bg-brand-900/30 text-brand-700 dark:text-brand-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-brand-300 dark:hover:border-brand-600'
                  }`}
                >
                  <span
                    className="h-6 w-6 rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
                    style={{ backgroundColor: b.color }}
                  >
                    {b.initial}
                  </span>
                  <span className="truncate">{b.name}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <h3 className="font-semibold text-slate-900 dark:text-white">How to Export from {selectedBroker.name}</h3>
            {selectedBroker.steps.map((s) => (
              <div key={s.title}>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">{s.title}</p>
                <ol className="list-decimal list-inside space-y-1 text-sm text-slate-600 dark:text-slate-300">
                  {s.items.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-600 transition-colors p-12 flex flex-col items-center justify-center gap-3 cursor-pointer text-center"
          >
            <UploadCloud className="text-brand-500 dark:text-brand-300" size={36} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Drop your {selectedBroker.name} export here, or click to browse
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Supports .csv, .xlsx, .xls</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </>
      )}

      {status === 'idle' && importTab === 'standard' && (
        <>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-100">New to importing?</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Download a starter template with sample mutual funds, stocks, gold, and fixed
                deposits — fill it in and drop it back here.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => exportToCsv('aurafin-import-template', IMPORT_TEMPLATE_ROWS)}
                className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-300 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-medium"
              >
                <FileText size={14} />
                CSV Template
              </button>
              <button
                onClick={() =>
                  exportToXlsx('aurafin-import-template', IMPORT_TEMPLATE_ROWS, 'Holdings')
                }
                className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-800 hover:border-brand-400 dark:hover:border-brand-600 hover:text-brand-600 dark:hover:text-brand-300 text-slate-600 dark:text-slate-300 px-3 py-2 rounded-lg text-xs font-medium"
              >
                <FileSpreadsheet size={14} />
                Excel Template
              </button>
            </div>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-brand-400 dark:hover:border-brand-600 transition-colors p-12 flex flex-col items-center justify-center gap-3 cursor-pointer text-center"
          >
            <UploadCloud className="text-brand-500 dark:text-brand-300" size={36} />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Drop a CSV or Excel file here, or click to browse
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Supports .csv, .xlsx, .xls — mutual funds, stocks, gold, FDs and more. Columns like
              Name, Value, Asset Class, and Currency are auto-detected
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>
        </>
      )}

      {status === 'parsing' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 dark:text-slate-500 text-sm">
          Reading {fileName}...
        </div>
      )}

      {status === 'error' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-red-200 p-6 flex items-start gap-3">
          <AlertCircle className="text-red-500 dark:text-red-400 shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorMsg}</p>
            <button onClick={reset} className="text-xs text-brand-600 dark:text-brand-300 font-medium mt-2">
              Try another file
            </button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-brand-200 dark:border-brand-700 p-8 text-center">
          <CheckCircle2 className="text-brand-500 dark:text-brand-300 mx-auto mb-3" size={36} />
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
            {importResult && importResult.updated > 0
              ? `Updated ${importResult.updated} existing holding${importResult.updated === 1 ? '' : 's'}${
                  importResult.added > 0
                    ? ` and added ${importResult.added} new one${importResult.added === 1 ? '' : 's'}`
                    : ''
                }`
              : `Imported ${validRows.length} assets worth ${formatCurrency(totalValue)}`}
          </p>
          <button
            onClick={reset}
            className="mt-4 bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Import Another File
          </button>
        </div>
      )}

      {(status === 'ready' || status === 'saving') && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium text-slate-800 dark:text-slate-100">{fileName}</span>
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                {validRows.length} of {rows.length} rows ready · {formatCurrency(totalValue)} total
              </span>
            </div>
            <button onClick={reset} className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300">
              Cancel
            </button>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-left">
                <tr>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Asset Class</th>
                  <th className="px-4 py-3 font-medium">Invested</th>
                  <th className="px-4 py-3 font-medium">Current Price</th>
                  <th className="px-4 py-3 font-medium">Current Value</th>
                  <th className="px-4 py-3 font-medium">P&L</th>
                  <th className="px-4 py-3 font-medium">Currency</th>
                  <th className="px-4 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r, i) => (
                  <tr key={i} className={r.valid ? '' : 'bg-red-50/40 dark:bg-red-900/30'}>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{r.name || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.assetClass}
                        onChange={(e) => updateRowClass(i, e.target.value as AssetClass)}
                        className="border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                      >
                        {ASSET_TAXONOMY.map((cat) => (
                          <optgroup key={cat.key} label={cat.label}>
                            {cat.types.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {r.investedValue ? formatPreciseCurrency(r.investedValue, r.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                      {r.currentPrice
                        ? formatPreciseCurrency(r.currentPrice, r.currency)
                        : r.quantity && r.quantity > 0 && r.value > 0
                          ? formatPreciseCurrency(r.value / r.quantity, r.currency)
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800 dark:text-slate-100">
                      {r.value > 0 ? formatCurrency(r.value, r.currency) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.pnl !== undefined ? (
                        <span className={r.pnl >= 0 ? 'text-brand-600 dark:text-brand-300' : 'text-red-500 dark:text-red-400'}>
                          {r.pnl >= 0 ? '+' : ''}
                          {formatPreciseCurrency(r.pnl, r.currency)}
                          {r.pnlPercent !== undefined && (
                            <span className="text-xs ml-1">
                              ({r.pnl >= 0 ? '+' : ''}
                              {r.pnlPercent.toFixed(2)}%)
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{r.currency}</td>
                    <td className="px-4 py-3">
                      {r.valid ? (
                        <span className="text-xs text-brand-600 dark:text-brand-300">Ready</span>
                      ) : (
                        <span className="text-xs text-red-500 dark:text-red-400">Skipped</span>
                      )}
                      <button
                        onClick={() => removeRow(i)}
                        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 ml-3"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="flex items-start gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3.5 cursor-pointer">
            <input
              type="checkbox"
              checked={matchExisting}
              onChange={(e) => setMatchExisting(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand-600 shrink-0"
            />
            <span>
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200">
                Update matching holdings instead of duplicating them
              </span>
              <span className="block text-xs text-slate-400 dark:text-slate-500 mt-0.5">
                Matches by trading symbol (or name) and asset type. Turn this on before re-importing the
                same weekly export so prices/quantities refresh in place — turn it off if you actually want
                a second, separate entry.
              </span>
            </span>
          </label>

          {matchExisting && (preview.updatedCount > 0 || preview.addedCount > 0) && (
            <p className="text-xs text-slate-500 dark:text-slate-400 px-1">
              Will update <strong className="text-slate-700 dark:text-slate-200">{preview.updatedCount}</strong>{' '}
              existing holding{preview.updatedCount === 1 ? '' : 's'} and add{' '}
              <strong className="text-slate-700 dark:text-slate-200">{preview.addedCount}</strong> new one
              {preview.addedCount === 1 ? '' : 's'}.
            </p>
          )}

          <button
            onClick={handleImport}
            disabled={validRows.length === 0 || status === 'saving'}
            className="w-full bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white py-3 rounded-lg text-sm font-medium"
          >
            {status === 'saving'
              ? 'Saving...'
              : `Import ${validRows.length} Asset${validRows.length === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  );
}
