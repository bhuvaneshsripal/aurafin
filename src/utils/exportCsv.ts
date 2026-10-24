
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking straight away can cancel the download in Safari/some mobile
  // browsers; give the browser a moment to start it first.
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Spreadsheet apps treat a text cell starting with = + - @ (or a tab/CR) as
 *  a formula, so a note like `=HYPERLINK(...)` typed into the app would run
 *  when the export is opened in Excel/Sheets (CSV injection). Prefixing a
 *  single quote forces it to be read as plain text. Real numbers, and strings
 *  that are just numbers like "-500", are left untouched. */
function neutraliseFormulas(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const NUMERIC = /^[-+]?\d+(\.\d+)?$/;
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      out[key] =
        typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !NUMERIC.test(value) ? `'${value}` : value;
    }
    return out;
  });
}

/**
 * Exports an array of flat objects to a downloaded CSV file.
 */
export async function exportToCsv(filename: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(neutraliseFormulas(rows));
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  // UTF-8 BOM so Excel shows ₹ and non-English names correctly.
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/**
 * Exports an array of flat objects to a downloaded Excel (.xlsx) file.
 */
export async function exportToXlsx(filename: string, rows: Record<string, unknown>[], sheetName = 'Sheet1') {
  if (rows.length === 0) return;
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.json_to_sheet(neutraliseFormulas(rows));
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
