import * as XLSX from 'xlsx';
import type { Asset, AssetClass } from '../types';

export interface ParsedRow {
  raw: Record<string, unknown>;
  name: string;
  value: number;
  assetClass: AssetClass;
  currency: string;
  valid: boolean;
  symbol?: string;
  quantity?: number;
  avgCost?: number;
  currentPrice?: number;
  investedValue?: number;
  pnl?: number;
  pnlPercent?: number;
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

const INVESTED_HEADERS = ['invested', 'invested value', 'invested amt', 'invested amount', 'cost value', 'book value'];

const PNL_HEADERS = ['p&l', 'pnl', 'p & l', 'profit/loss', 'profit or loss', 'unrealized p&l', 'gain/loss'];

const PNL_PERCENT_HEADERS = ['p&l %', 'pnl %', 'p&l pct', 'p&l percent', 'return %', 'returns %', 'gain %'];

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
  equity: 'stock',
  stock: 'stock',
  stocks: 'stock',
  shares: 'stock',
  etf: 'etf',
  mutual: 'equity_mutual_fund',
  mf: 'equity_mutual_fund',
  'mutual fund': 'equity_mutual_fund',
  fund: 'equity_mutual_fund',
  'index fund': 'index_fund',
  sip: 'sip',
  'real estate': 'residential_property',
  property: 'residential_property',
  realestate: 'residential_property',
  gold: 'gold',
  silver: 'silver',
  sgb: 'sovereign_gold_bond',
  epf: 'epf',
  ppf: 'ppf',
  vpf: 'vpf',
  nps: 'nps',
  bond: 'government_bond',
  'government bond': 'government_bond',
  'corporate bond': 'corporate_bond',
  fd: 'fixed_deposit',
  'fixed deposit': 'fixed_deposit',
  deposit: 'fixed_deposit',
  rd: 'recurring_deposit',
  'recurring deposit': 'recurring_deposit',
  crypto: 'crypto_coin',
  bitcoin: 'crypto_coin',
  nft: 'nft',
  cash: 'cash',
  savings: 'cash',
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
  const ltpKey = findHeaderKey(headers, PRICE_HEADERS);
  const avgPriceKey = findHeaderKey(headers, AVG_PRICE_HEADERS);
  const priceKey = ltpKey ?? avgPriceKey;
  const investedKey = findHeaderKey(headers, INVESTED_HEADERS);
  const pnlKey = findHeaderKey(headers, PNL_HEADERS);
  const pnlPercentKey = findHeaderKey(headers, PNL_PERCENT_HEADERS);

  // No asset-class column at all, but the sheet clearly looks like a
  // broker holdings export -> treat every row as equity by default.
  const looksLikeEquityExport =
    !classKey && normalizedHeaders.some((h) => EQUITY_EXPORT_SIGNALS.includes(h));

  return rows.map((raw) => {
    const name = nameKey ? String(raw[nameKey] ?? '').trim() : '';
    const symbol = nameKey && nameKey !== 'name' && nameKey !== 'asset' && nameKey !== 'asset name'
      ? name.toUpperCase()
      : name.toUpperCase();

    const quantity = qtyKey ? toNumber(raw[qtyKey]) : undefined;
    const avgCost = avgPriceKey ? toNumber(raw[avgPriceKey]) : undefined;
    const currentPrice = ltpKey ? toNumber(raw[ltpKey]) : undefined;

    let value = valueKey ? toNumber(raw[valueKey]) : 0;
    if (value <= 0 && quantity && quantity > 0 && currentPrice && currentPrice > 0) {
      value = quantity * currentPrice;
    } else if (value <= 0 && quantity && quantity > 0 && priceKey) {
      const price = toNumber(raw[priceKey]);
      if (price > 0) value = quantity * price;
    }

    const detectedClass = classKey ? guessAssetClass(raw[classKey]) : undefined;
    const assetClass: AssetClass = detectedClass ?? (looksLikeEquityExport ? 'stock' : 'other');

    const currency = currencyKey ? String(raw[currencyKey] ?? 'INR').trim() || 'INR' : 'INR';

    // Invested value: prefer explicit column, else Qty x Avg. cost (full decimal precision).
    let investedValue = investedKey ? toNumber(raw[investedKey]) : 0;
    if (investedValue <= 0 && quantity && quantity > 0 && avgCost && avgCost > 0) {
      investedValue = quantity * avgCost;
    }

    // P&L: prefer an explicit column, else derive from value - invested.
    let pnl = pnlKey ? toNumber(raw[pnlKey]) : undefined;
    if (pnl === undefined && investedValue > 0 && value > 0) {
      pnl = value - investedValue;
    }

    let pnlPercent = pnlPercentKey ? toNumber(raw[pnlPercentKey]) : undefined;
    if (pnlPercent === undefined && pnl !== undefined && investedValue > 0) {
      pnlPercent = (pnl / investedValue) * 100;
    }

    const hasSymbol = looksLikeEquityExport || assetClass === 'stock';

    return {
      raw,
      name,
      value,
      assetClass,
      currency,
      valid: name.length > 0 && value > 0,
      symbol: hasSymbol && symbol ? symbol : undefined,
      quantity: quantity && quantity > 0 ? quantity : undefined,
      avgCost: avgCost && avgCost > 0 ? avgCost : undefined,
      currentPrice: currentPrice && currentPrice > 0 ? currentPrice : undefined,
      investedValue: investedValue > 0 ? investedValue : undefined,
      pnl,
      pnlPercent,
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
      symbol: r.symbol,
      quantity: r.quantity,
      avgCost: r.avgCost,
      investedValue: r.investedValue,
      pnl: r.pnl,
      pnlPercent: r.pnlPercent,
    }));
}
