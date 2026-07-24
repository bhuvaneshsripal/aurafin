import * as XLSX from 'xlsx';
import type { Asset, AssetClass } from '../types';

export interface ParsedRow {
  raw: Record<string, unknown>;
  name: string;
  value: number;
  assetClass: AssetClass;
  currency: string;
  valid: boolean;
}

// --- Header candidates -------------------------------------------------
// Broad enough to cover generic sheets ("Name", "Value") as well as
// broker holdings exports like Zerodha/Kite ("Symbol", "Instrument",
// "Qty.", "Avg. cost", "LTP", "Cur. val").

const NAME_HEADERS = [
  'name',
  'asset',
  'asset name',
  'description',
  'holding',
  'instrument',
  'symbol',
  'scrip',
  'stock',
  'ticker',
  'tradingsymbol',
];

const VALUE_HEADERS = [
  'value',
  'amount',
  'current value',
  'market value',
  'balance',
  'invested value',
  'cur. val',
  'cur val',
  'curval',
  'closing value',
  'holding value',
  'net value',
];

const QTY_HEADERS = ['qty', 'qty.', 'quantity', 'quantity available', 'shares', 'units'];

const PRICE_HEADERS = [
  'ltp',
  'last price',
  'last traded price',
  'close price',
  'closing price',
  'previous closing price',
  'cmp',
  'current price',
  'market price',
];

const AVG_PRICE_HEADERS = ['avg. cost', 'avg cost', 'average price', 'avg. price', 'avg price', 'buy price'];

const CLASS_HEADERS = ['class', 'asset class', 'category', 'type'];
const CURRENCY_HEADERS = ['currency', 'ccy'];

// Header names that only ever show up in broker holdings exports. If we
// see one of these and there's no explicit asset-class column, we can
// safely assume every row in the sheet is an equity holding.
const EQUITY_EXPORT_SIGNALS = [
  'isin',
  'ltp',
  'tradingsymbol',
  'quantity available',
  'avg. cost',
  'avg cost',
  'cur. val',
  'cur val',
];

const CLASS_KEYWORD_MAP: Record<string, AssetClass> = {
  equity: 'equity',
  stock: 'equity',
  stocks: 'equity',
  shares: 'equity',
  mutual: 'mutual_fund',
  mf: 'mutual_fund',
  'mutual fund': 'mutual_fund',
  fund: 'mutual_fund',
  'real estate': 'real_estate',
  property: 'real_estate',
  realestate: 'real_estate',
  gold: 'gold',
  sgb: 'gold',
  epf: 'epf_ppf',
  ppf: 'epf_ppf',
  nps: 'nps',
  fd: 'fixed_deposit',
  'fixed deposit': 'fixed_deposit',
  deposit: 'fixed_deposit',
  crypto: 'crypto',
  bitcoin: 'crypto',
  cash: 'cash',
};

function normalizeHeader(h: string) {
  return h.trim().toLowerCase();
}

function findHeaderKey(headers: string[], candidates: string[]): string | undefined {
  return headers.find((h) => candidates.includes(normalizeHeader(h)));
}

function guessAssetClass(value: unknown): AssetClass | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  return CLASS_KEYWORD_MAP[key];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[₹$,\s]/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Reads a File (CSV or Excel) and returns parsed rows with best-effort
 * column mapping. Works for .csv, .xlsx, and .xls since SheetJS handles
 * all three the same way.
 *
 * Handles two shapes of data:
 *  1. Generic sheets with an explicit Value column (e.g. "Value", "Amount").
 *  2. Broker holdings exports (e.g. Zerodha/Kite) that only give Qty +
 *     a price column (LTP, or Avg. cost as a fallback) — in which case
 *     the value is computed as Qty x Price.
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const normalizedHeaders = headers.map(normalizeHeader);

  const nameKey = findHeaderKey(headers, NAME_HEADERS);
  const valueKey = findHeaderKey(headers, VALUE_HEADERS);
  const classKey = findHeaderKey(headers, CLASS_HEADERS);
  const currencyKey = findHeaderKey(headers, CURRENCY_HEADERS);
  const qtyKey = findHeaderKey(headers, QTY_HEADERS);
  const priceKey = findHeaderKey(headers, PRICE_HEADERS) ?? findHeaderKey(headers, AVG_PRICE_HEADERS);

  // No asset-class column at all, but the sheet clearly looks like a
  // broker holdings export -> treat every row as equity by default.
  const looksLikeEquityExport =
    !classKey && normalizedHeaders.some((h) => EQUITY_EXPORT_SIGNALS.includes(h));

  return rows.map((raw) => {
    const name = nameKey ? String(raw[nameKey] ?? '').trim() : '';

    let value = valueKey ? toNumber(raw[valueKey]) : 0;
    if (value <= 0 && qtyKey && priceKey) {
      const qty = toNumber(raw[qtyKey]);
      const price = toNumber(raw[priceKey]);
      if (qty > 0 && price > 0) value = qty * price;
    }

    const detectedClass = classKey ? guessAssetClass(raw[classKey]) : undefined;
    const assetClass: AssetClass = detectedClass ?? (looksLikeEquityExport ? 'equity' : 'other');

    const currency = currencyKey ? String(raw[currencyKey] ?? 'INR').trim() || 'INR' : 'INR';

    return {
      raw,
      name,
      value,
      assetClass,
      currency,
      valid: name.length > 0 && value > 0,
    };
  });
}

export function rowsToAssets(rows: ParsedRow[]): Asset[] {
  return rows
    .filter((r) => r.valid)
    .map((r) => ({
      id: crypto.randomUUID(),
      name: r.name,
      assetClass: r.assetClass,
      value: r.value,
      currency: r.currency,
      updatedAt: Date.now(),
    }));
}
