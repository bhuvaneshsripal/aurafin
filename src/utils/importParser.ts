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
  isin?: string;
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
  'stock name',
  'ticker',
  'tradingsymbol',
  'trading symbol',
  'company',
  'company name',
  'scheme',
  'scheme name',
  'fund',
  'fund name',
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
  'current val.',
  'present value',
  'total value',
];

const QTY_HEADERS = [
  'qty',
  'qty.',
  'quantity',
  'quantity available',
  'net quantity',
  'shares',
  'units',
  'no. of units',
  'no of units',
];

const PRICE_HEADERS = [
  'ltp',
  'last price',
  'last traded price',
  'close price',
  'closing price',
  'previous closing price',
  'cmp',
  'current price',
  'current nav',
  'nav',
  'market price',
];

const AVG_PRICE_HEADERS = [
  'avg. cost',
  'avg cost',
  'average price',
  'avg. price',
  'avg price',
  'buy price',
  'average buy price',
  'avg buy price',
  'purchase price',
  'purchase nav',
];

const INVESTED_HEADERS = [
  'invested',
  'invested value',
  'invested amt',
  'invested amount',
  'cost value',
  'book value',
  'buy value',
  'purchase value',
  'principal value',
  'principal',
];

const PNL_HEADERS = [
  'p&l',
  'pnl',
  'p & l',
  'profit/loss',
  'profit or loss',
  'unrealized p&l',
  'unrealised p&l',
  'unrealized gain/loss',
  'unrealised gain/loss',
  'gain/loss',
  'total gain/loss',
];

const PNL_PERCENT_HEADERS = [
  'p&l %',
  'pnl %',
  'p&l pct',
  'p&l pct.',
  'p&l percent',
  'unrealized p&l pct.',
  'unrealised p&l pct.',
  'unrealised p&l %',
  'unrealized p&l %',
  'return %',
  'returns %',
  'gain %',
  'net change %',
];

const CLASS_HEADERS = ['class', 'asset class', 'category', 'type'];
const CURRENCY_HEADERS = ['currency', 'ccy'];
const ISIN_HEADERS = ['isin', 'isin code', 'isin no', 'isin no.'];

// Header names that only ever show up in broker holdings exports. If we
// see one of these and there's no explicit asset-class column, we can
// safely assume every row in the sheet is an equity holding.
const EQUITY_EXPORT_SIGNALS = [
  'isin',
  'ltp',
  'tradingsymbol',
  'trading symbol',
  'quantity available',
  'avg. cost',
  'avg cost',
  'cur. val',
  'cur val',
  'closing price',
  'closing value',
  'buy value',
  'average buy price',
];

// Every header candidate across all the maps above, used to score which
// row in a raw sheet is most likely the real header row (broker exports
// like Zerodha Console / Groww put a title + date range above the table).
const ALL_HEADER_CANDIDATES = new Set([
  ...NAME_HEADERS,
  ...VALUE_HEADERS,
  ...QTY_HEADERS,
  ...PRICE_HEADERS,
  ...AVG_PRICE_HEADERS,
  ...INVESTED_HEADERS,
  ...PNL_HEADERS,
  ...PNL_PERCENT_HEADERS,
  ...CLASS_HEADERS,
  ...CURRENCY_HEADERS,
  ...ISIN_HEADERS,
]);

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
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

// Broker holdings exports (Zerodha Console, Groww, etc.) often place a
// report title, account name, and/or "as of <date>" line above the real
// table header. If we naively treat row 1 as the header, every column
// name ends up being blank/garbage and the whole file fails to import.
// So instead we scan the first few rows of the sheet and pick whichever
// one looks the most like a real header row (i.e. has the most cells
// that match a known column name).
function detectHeaderRowIndex(aoa: unknown[][]): number {
  const maxScan = Math.min(aoa.length, 25);
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < maxScan; i++) {
    const row = aoa[i];
    if (!row || row.length === 0) continue;

    const cells = row.map((c) => (typeof c === 'string' ? normalizeHeader(c) : ''));
    const filledCells = cells.filter((c) => c.length > 0);
    if (filledCells.length < 2) continue;

    const matches = filledCells.filter((c) => ALL_HEADER_CANDIDATES.has(c)).length;
    if (matches === 0) continue;

    // Prefer more matches; break ties by preferring rows with fewer
    // "extra" unmatched cells (closer to a clean header row).
    const score = matches * 10 + Math.min(filledCells.length, 10);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestScore >= 0 ? bestIdx : 0;
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

  // Broker exports sometimes put the actual holdings on a sheet other
  // than the first (e.g. a "Summary" sheet first, "Holdings" second), and
  // the real header row is often a few rows down (title/date lines above
  // it). Try each sheet, detect its header row, and use the first sheet
  // that yields at least one usable data row.
  let rows: Record<string, unknown>[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
    if (aoa.length === 0) continue;

    const headerRowIndex = detectHeaderRowIndex(aoa);
    const candidateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
      range: headerRowIndex,
    });

    // Drop blank spacer rows and footer/notes rows that have no data in
    // any recognizable column.
    const cleaned = candidateRows.filter((r) =>
      Object.values(r).some((v) => String(v ?? '').trim().length > 0)
    );

    if (cleaned.length > 0) {
      rows = cleaned;
      break;
    }
  }

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
  const isinKey = findHeaderKey(headers, ISIN_HEADERS);

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
    const isin = isinKey ? String(raw[isinKey] ?? '').trim().toUpperCase() : '';

    return {
      raw,
      name,
      value,
      assetClass,
      currency,
      valid: name.length > 0 && value > 0,
      symbol: hasSymbol && symbol ? symbol : undefined,
      isin: hasSymbol && isin ? isin : undefined,
      quantity: quantity && quantity > 0 ? quantity : undefined,
      avgCost: avgCost && avgCost > 0 ? avgCost : undefined,
      currentPrice: currentPrice && currentPrice > 0 ? currentPrice : undefined,
      investedValue: investedValue > 0 ? investedValue : undefined,
      pnl,
      pnlPercent,
    };
  });
}

export interface ImportMergeResult {
  assets: Asset[];
  /** Rows that matched an existing holding and will overwrite it in place. */
  updatedCount: number;
  /** Rows that didn't match anything and will be added as new holdings. */
  addedCount: number;
}

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Finds the existing asset a given import row should update in place,
 * instead of being added as a duplicate. Matches by trading symbol first
 * (most reliable for a weekly broker re-export where prices/quantities
 * change but the ticker doesn't), falling back to an exact name match —
 * both scoped to the same asset class so e.g. an "HDFC" stock and an
 * "HDFC" mutual fund are never confused for each other.
 */
export function findMatchingAsset(row: ParsedRow, existingAssets: Asset[]): Asset | undefined {
  const symbol = row.symbol?.trim().toUpperCase();
  if (symbol) {
    const bySymbol = existingAssets.find(
      (a) => a.assetClass === row.assetClass && a.symbol?.trim().toUpperCase() === symbol
    );
    if (bySymbol) return bySymbol;
  }
  const name = normalizeText(row.name);
  return existingAssets.find((a) => a.assetClass === row.assetClass && normalizeText(a.name) === name);
}

/**
 * Converts parsed rows into Asset documents ready to save.
 *
 * When `existingAssets` is provided and `matchExisting` isn't turned off,
 * a row that matches a holding already in the portfolio (see
 * findMatchingAsset) reuses that asset's id — so bulkUpsertDocs() updates
 * the existing document (fresh value/quantity/avg cost/P&L) instead of
 * creating a duplicate every time the same weekly export is re-imported.
 * Fields the CSV doesn't carry (institution, interest rate, notes, etc.)
 * are preserved from the existing record rather than wiped out.
 */
export function rowsToAssets(
  rows: ParsedRow[],
  existingAssets: Asset[] = [],
  matchExisting = true
): ImportMergeResult {
  let updatedCount = 0;
  let addedCount = 0;

  const assets = rows
    .filter((r) => r.valid)
    .map((r) => {
      const match = matchExisting ? findMatchingAsset(r, existingAssets) : undefined;
      if (match) updatedCount++;
      else addedCount++;

      return {
        ...match,
        id: match?.id ?? crypto.randomUUID(),
        name: r.name,
        assetClass: r.assetClass,
        value: r.value,
        currency: r.currency,
        updatedAt: Date.now(),
        symbol: r.symbol ?? match?.symbol,
        isin: r.isin ?? match?.isin,
        quantity: r.quantity ?? match?.quantity,
        avgCost: r.avgCost ?? match?.avgCost,
        investedValue: r.investedValue ?? match?.investedValue,
        pnl: r.pnl ?? match?.pnl,
        pnlPercent: r.pnlPercent ?? match?.pnlPercent,
      };
    });

  return { assets, updatedCount, addedCount };
}
