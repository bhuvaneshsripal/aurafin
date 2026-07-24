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

const NAME_HEADERS = ['name', 'asset', 'asset name', 'description', 'holding', 'instrument'];
const VALUE_HEADERS = ['value', 'amount', 'current value', 'market value', 'balance', 'invested value'];
const CLASS_HEADERS = ['class', 'asset class', 'category', 'type'];
const CURRENCY_HEADERS = ['currency', 'ccy'];

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

function guessAssetClass(value: unknown): AssetClass {
  if (typeof value !== 'string') return 'other';
  const key = value.trim().toLowerCase();
  return CLASS_KEYWORD_MAP[key] ?? 'other';
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
 */
export async function parseSpreadsheetFile(file: File): Promise<ParsedRow[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  if (rows.length === 0) return [];

  const headers = Object.keys(rows[0]);
  const nameKey = findHeaderKey(headers, NAME_HEADERS);
  const valueKey = findHeaderKey(headers, VALUE_HEADERS);
  const classKey = findHeaderKey(headers, CLASS_HEADERS);
  const currencyKey = findHeaderKey(headers, CURRENCY_HEADERS);

  return rows.map((raw) => {
    const name = nameKey ? String(raw[nameKey] ?? '').trim() : '';
    const value = valueKey ? toNumber(raw[valueKey]) : 0;
    const assetClass = classKey ? guessAssetClass(raw[classKey]) : 'other';
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
