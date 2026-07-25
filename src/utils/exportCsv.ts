import * as XLSX from 'xlsx';

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports an array of flat objects to a downloaded CSV file.
 */
export function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Exports an array of flat objects to a downloaded Excel (.xlsx) file.
 */
export function exportToXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'Sheet1') {
  if (rows.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  triggerDownload(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/**
 * Sample rows for the "download a template" helper on the Import page.
 * Deliberately spans several asset classes (equity, mutual funds, ETFs,
 * gold, fixed deposit) so people importing from scratch — not just from a
 * broker export — see how each type should be filled in.
 */
export const IMPORT_TEMPLATE_ROWS: Record<string, unknown>[] = [
  {
    Name: 'HDFC Flexi Cap Fund',
    'Asset Class': 'Mutual Fund',
    Quantity: 120.485,
    'Avg Cost': 45.2,
    'Current Price': 52.81,
    Currency: 'INR',
  },
  {
    Name: 'Nippon India Index Fund',
    'Asset Class': 'Index Fund',
    Quantity: 300,
    'Avg Cost': 22.1,
    'Current Price': 24.6,
    Currency: 'INR',
  },
  {
    Name: 'Reliance Industries',
    'Asset Class': 'Stock',
    Quantity: 10,
    'Avg Cost': 2200,
    'Current Price': 2450,
    Currency: 'INR',
  },
  {
    Name: 'Nippon India Gold ETF',
    'Asset Class': 'Gold',
    Quantity: 25,
    'Avg Cost': 52,
    'Current Price': 58.4,
    Currency: 'INR',
  },
  {
    Name: 'HDFC Bank Fixed Deposit',
    'Asset Class': 'Fixed Deposit',
    Quantity: '',
    'Avg Cost': '',
    'Current Price': '',
    Value: 200000,
    Currency: 'INR',
  },
];
