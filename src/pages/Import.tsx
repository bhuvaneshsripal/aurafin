import { useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, AlertCircle, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { bulkUpsertDocs } from '../hooks/useFirestoreSync';
import { parseSpreadsheetFile, rowsToAssets, type ParsedRow } from '../utils/importParser';
import { formatCurrency, formatPreciseCurrency } from '../utils/currency';
import { ASSET_TAXONOMY } from '../utils/taxonomy';
import { exportToCsv, exportToXlsx, IMPORT_TEMPLATE_ROWS } from '../utils/exportCsv';
import type { AssetClass } from '../types';

export default function Import() {
  const user = useAuthStore((s) => s.user);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'parsing' | 'ready' | 'saving' | 'done' | 'error'>(
    'idle'
  );
  const [errorMsg, setErrorMsg] = useState('');

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

  const handleImport = async () => {
    if (!user || validRows.length === 0) return;
    setStatus('saving');
    try {
      const assets = rowsToAssets(rows);
      await bulkUpsertDocs(user.uid, 'assets', assets);
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
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Import Assets</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upload a CSV or Excel file to bulk-add assets to your portfolio.
        </p>
      </div>

      {status === 'idle' && (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-800">New to importing?</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Download a starter template with sample mutual funds, stocks, gold, and fixed
                deposits — fill it in and drop it back here.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => exportToCsv('aurafin-import-template', IMPORT_TEMPLATE_ROWS)}
                className="flex items-center gap-1.5 border border-slate-200 hover:border-brand-400 hover:text-brand-600 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium"
              >
                <FileText size={14} />
                CSV Template
              </button>
              <button
                onClick={() =>
                  exportToXlsx('aurafin-import-template', IMPORT_TEMPLATE_ROWS, 'Holdings')
                }
                className="flex items-center gap-1.5 border border-slate-200 hover:border-brand-400 hover:text-brand-600 text-slate-600 px-3 py-2 rounded-lg text-xs font-medium"
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
            className="bg-white rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 transition-colors p-12 flex flex-col items-center justify-center gap-3 cursor-pointer text-center"
          >
            <UploadCloud className="text-brand-500" size={36} />
            <p className="text-sm font-medium text-slate-700">
              Drop a CSV or Excel file here, or click to browse
            </p>
            <p className="text-xs text-slate-400">
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
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
          Reading {fileName}...
        </div>
      )}

      {status === 'error' && (
        <div className="bg-white rounded-2xl border border-red-200 p-6 flex items-start gap-3">
          <AlertCircle className="text-red-500 shrink-0" size={20} />
          <div>
            <p className="text-sm font-medium text-red-600">{errorMsg}</p>
            <button onClick={reset} className="text-xs text-brand-600 font-medium mt-2">
              Try another file
            </button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="bg-white rounded-2xl border border-brand-200 p-8 text-center">
          <CheckCircle2 className="text-brand-500 mx-auto mb-3" size={36} />
          <p className="text-sm font-medium text-slate-800">
            Imported {validRows.length} assets worth {formatCurrency(totalValue)}
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
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex items-center justify-between text-sm">
            <div>
              <span className="font-medium text-slate-800">{fileName}</span>
              <span className="text-slate-400 ml-2">
                {validRows.length} of {rows.length} rows ready · {formatCurrency(totalValue)} total
              </span>
            </div>
            <button onClick={reset} className="text-xs text-slate-400 hover:text-slate-600">
              Cancel
            </button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-left">
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
                  <tr key={i} className={r.valid ? '' : 'bg-red-50/40'}>
                    <td className="px-4 py-3 text-slate-800">{r.name || '—'}</td>
                    <td className="px-4 py-3">
                      <select
                        value={r.assetClass}
                        onChange={(e) => updateRowClass(i, e.target.value as AssetClass)}
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
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
                    <td className="px-4 py-3 text-slate-500">
                      {r.investedValue ? formatPreciseCurrency(r.investedValue, r.currency) : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {r.currentPrice
                        ? formatPreciseCurrency(r.currentPrice, r.currency)
                        : r.quantity && r.quantity > 0 && r.value > 0
                          ? formatPreciseCurrency(r.value / r.quantity, r.currency)
                          : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      {r.value > 0 ? formatCurrency(r.value, r.currency) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {r.pnl !== undefined ? (
                        <span className={r.pnl >= 0 ? 'text-brand-600' : 'text-red-500'}>
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
                    <td className="px-4 py-3 text-slate-500">{r.currency}</td>
                    <td className="px-4 py-3">
                      {r.valid ? (
                        <span className="text-xs text-brand-600">Ready</span>
                      ) : (
                        <span className="text-xs text-red-500">Skipped</span>
                      )}
                      <button
                        onClick={() => removeRow(i)}
                        className="text-xs text-slate-400 hover:text-slate-600 ml-3"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
