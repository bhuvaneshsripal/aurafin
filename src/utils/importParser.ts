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
  'scrip name',
  'script name',
  'security name',
  'name of the security',
  'instrument name',
  'stock/fund',
  'stock name(s)',
  'security description',
  'folio scheme name',
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
  'current val',
  'value at market price',
  'value at market',
  'market val',
  'present market value',
  'current market value',
  'value (inr)',
  'current amount',
  'valuation',
  'market value (inr)',
  'value as on',
  'closing balance value',
  'current value (inr)',
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
  'net qty',
  'total qty',
  'total quantity',
  'balance qty',
  'current qty',
  'holding qty',
  'qty available',
  'free qty',
  'units held',
  'unit balance',
  'closing units',
  'available units',
  'balance units',
  'closing balance units',
  'quantity held',
  'position',
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
  'current market price',
  'current rate',
  'market rate',
  'latest nav',
  'close',
  'last close',
  'current price (inr)',
  'closing nav',
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
  'avg rate',
  'average cost',
  'average cost price',
  'avg. cost price',
  'avg cost price',
  'average rate',
  'avg. buy price',
  'avg buy rate',
  'cost price',
  'average nav',
  'avg nav',
  'avg. nav',
  'purchase avg price',
  'average purchase price',
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
  'value at cost',
  'cost',
  'total cost',
  'total invested',
  'amount invested',
  'investment',
  'investment amount',
  'cost basis',
  'buy amount',
  'total buy value',
  'purchase amount',
  'invested amt.',
  'cost value (inr)',
  'invested (inr)',
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
  'unrealized profit/loss',
  'unrealised profit/loss',
  'unrealized p/l',
  'unrealised p/l',
  'p/l',
  'profit & loss',
  'profit and loss',
  'net p&l',
  'overall gain/loss',
  'gain / loss',
  'unrealized profit and loss',
  'unrealized pnl',
  'unrealised pnl',
  'current p&l',
  'overall p&l',
  'net gain/loss',
  'unrealized p&l (inr)',
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
  'unrealized p/l %',
  'unrealised p/l %',
  'p/l %',
  'net chg %',
  '% change',
  'change %',
  'overall return %',
  'absolute return %',
  'net p&l %',
  'total return %',
  'gain/loss %',
  'overall gain %',
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

const CLASS_HEADERS = [
  'asset category',
  'asset type',
  'instrument type',
  'security type',
  'product type',
  'segment','class', 'asset class', 'category', 'type'];
const CURRENCY_HEADERS = [
  'curr',
  'currency code','currency', 'ccy'];
const ISIN_HEADERS = [
  'isin number',
  'isin/code','isin', 'isin code', 'isin no', 'isin no.'];

// A distinct trading-symbol column, when the sheet also has a separate full
// company-name column (Groww's order history has both "Stock name" and
// "Symbol"; Zerodha's holdings export only has one combined column, which
// still gets picked up fine since it's also a NAME_HEADERS candidate).
const SYMBOL_HEADERS = [
  'scrip symbol',
  'security symbol',
  'nse symbol',
  'nse code',
  'ticker symbol',
  'stock code','symbol', 'tradingsymbol', 'trading symbol', 'ticker', 'stock symbol', 'scrip code'];

// Some broker exports are a *transaction/order history* (one row per trade,
// e.g. Groww's "Stocks Order History") rather than a snapshot of current
// holdings (one row per holding, e.g. Zerodha Console). These carry a
// Buy/Sell column that a naive header match would otherwise mistake for an
// asset-class column (see CLASS_HEADERS including the very generic "type").
const TXN_TYPE_HEADERS = ['type', 'txn type', 'transaction type', 'order type', 'buy/sell', 'trade type'];
const ORDER_STATUS_HEADERS = ['order status', 'status'];
const EXECUTION_DATE_HEADERS = ['execution date and time', 'execution date', 'order date', 'trade date', 'order execution time'];

// Header names that only ever show up in broker holdings exports. If we
// see one of these and there's no explicit asset-class column, we can
// safely assume every row in the sheet is an equity holding.
const EQUITY_EXPORT_SIGNALS = [
  'cmp',
  'current market price',
  'value at market price',
  'value at cost',
  'average cost price',
  'avg rate',
  'net qty',
  'nse symbol',
  'cost price',
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
const ALL_HEADER_CANDIDATES_RAW = [
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
  ...SYMBOL_HEADERS,
  ...ORDER_STATUS_HEADERS,
  ...EXECUTION_DATE_HEADERS,
];
const ALL_HEADER_CANDIDATES = new Set(ALL_HEADER_CANDIDATES_RAW.map(squashHeader));

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
  eq: 'stock',
  equities: 'stock',
  stk: 'stock',
  etfs: 'etf',
  'mutual funds': 'equity_mutual_fund',
  mfs: 'equity_mutual_fund',
  'g-sec': 'government_bond',
  bonds: 'government_bond',
  'open positions': 'stock',
};

function normalizeHeader(h: string) {
  return h.replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Brokers decorate headers differently ("Avg. Price (₹)", "LTP*", "Qty"):
// compare on a squashed form with bracketed units and punctuation removed.
function squashHeader(h: string) {
  return normalizeHeader(h)
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9%&]/g, '');
}

const squashCache = new WeakMap<string[], Set<string>>();
function squashedSet(list: string[]): Set<string> {
  let set = squashCache.get(list);
  if (!set) {
    set = new Set(list.map(squashHeader));
    squashCache.set(list, set);
  }
  return set;
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

    const cells = row.map((c) => (typeof c === 'string' ? squashHeader(c) : ''));
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
  // Exact (normalized) match first so a precise header always beats a fuzzy one.
  const exact = headers.find((h) => candidates.includes(normalizeHeader(h)));
  if (exact) return exact;
  const set = squashedSet(candidates);
  return headers.find((h) => {
    const sq = squashHeader(h);
    return sq.length > 0 && set.has(sq);
  });
}

function guessAssetClass(value: unknown): AssetClass | undefined {
  if (typeof value !== 'string') return undefined;
  const key = value.trim().toLowerCase();
  return CLASS_KEYWORD_MAP[key];
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    let t = value.trim().replace(/[\u2212\u2013\u2014]/g, '-');
    // Accounting negatives: (1,234.50) -> -1234.50, and trailing Dr/Cr markers.
    const paren = /^\(.*\)$/.test(t);
    t = t.replace(/[₹$€£,\s()%]|rs\.?|inr|usd|dr$|cr$/gi, '');
    const n = parseFloat(t);
    if (!Number.isFinite(n)) return 0;
    return paren ? -Math.abs(n) : n;
  }
  return 0;
}

/** Like toNumber but returns undefined for blank / non-numeric cells, so a
 *  missing P&L can be derived instead of being treated as a real zero. */
function numOrUndef(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string' && !/\d/.test(value)) return undefined;
  if (typeof value !== 'number' && typeof value !== 'string') return undefined;
  return toNumber(value);
}

const TOTAL_ROW_RE = /^(grand\s+)?total\b|^sub-?total\b|^net\s+(total|worth)\b|^summary\b|^disclaimer|^note[s:]|^\*|^report generated|^as on\b|^as of\b/i;

function normalizeText(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Confirms a header that *looks* like it could be an asset-class column
 * (see CLASS_HEADERS including the very generic "type") is actually a
 * Buy/Sell transaction-type column, by sniffing its values, rather than
 * assuming from the header name alone. Returns undefined if the header
 * doesn't exist or its values don't look like Buy/Sell.
 */
function findTransactionTypeKey(headers: string[], rows: Record<string, unknown>[]): string | undefined {
  const key = findHeaderKey(headers, TXN_TYPE_HEADERS);
  if (!key) return undefined;
  const sample = rows.slice(0, 25).map((r) => normalizeText(String(r[key] ?? '')));
  const txnLike = sample.filter((v) => v === 'buy' || v === 'sell').length;
  return txnLike > 0 ? key : undefined;
}

/** Loosely parses the date formats broker exports tend to use (notably
 *  Groww's "20-04-2026 09:00 AM") into a sortable timestamp. Returns 0 for
 *  anything unrecognized rather than throwing — a stable sort then just
 *  falls back to file order for those rows, which is a reasonable default
 *  since most exports are already chronological. */
function parseDateLoose(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const s = value.trim();
    const m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:\s+(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)?)?/);
    if (m) {
      const [, dd, mm, yyyy, hh, min, ampm] = m;
      let hour = hh ? parseInt(hh, 10) : 0;
      if (ampm) {
        const isPM = ampm.toLowerCase() === 'pm';
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
      }
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hour, min ? parseInt(min, 10) : 0);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    const parsed = Date.parse(s);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

interface TxnKeys {
  nameKey?: string;
  symbolKey?: string;
  isinKey?: string;
  qtyKey?: string;
  valueKey?: string;
  txnTypeKey: string;
  statusKey?: string;
  dateKey?: string;
  currencyKey?: string;
}

const EXECUTED_STATUSES = new Set(['executed', 'complete', 'completed', 'filled', 'success', 'fully executed']);

/**
 * Turns a broker's *order/transaction history* (one row per trade — e.g.
 * Groww's "Stocks Order History" export) into current net holdings, since
 * that's what every other import source (a holdings snapshot) already
 * produces. Walks the trades in chronological order per symbol, tracking a
 * running quantity and average cost: a Buy adds to both; a Sell reduces
 * quantity and removes that quantity's share of the cost basis at the
 * *current* running average cost (the standard average-cost method).
 * Rejected/cancelled/pending orders are skipped when a status column says
 * so. Symbols fully exited (net quantity down to zero) are dropped, since
 * there's nothing currently held to import.
 *
 * There's no current market price in a trade log, so `value` is seeded
 * from the resulting invested value — a fine placeholder, since any row
 * with a symbol and quantity gets picked up by the live-price poller
 * (useLivePrices) within seconds of being saved and corrected there.
 */
function aggregateTransactionRows(rows: Record<string, unknown>[], keys: TxnKeys): ParsedRow[] {
  const { nameKey, symbolKey, isinKey, qtyKey, valueKey, txnTypeKey, statusKey, dateKey, currencyKey } = keys;

  const ordered = dateKey
    ? [...rows].sort((a, b) => parseDateLoose(a[dateKey]) - parseDateLoose(b[dateKey]))
    : rows;

  interface Group {
    name: string;
    symbol: string;
    isin: string;
    currency: string;
    qty: number;
    invested: number;
  }
  const groups = new Map<string, Group>();

  for (const raw of ordered) {
    if (statusKey) {
      const status = normalizeText(String(raw[statusKey] ?? ''));
      if (status && !EXECUTED_STATUSES.has(status)) continue;
    }

    const type = normalizeText(String(raw[txnTypeKey] ?? ''));
    if (type !== 'buy' && type !== 'sell') continue;

    const name = nameKey ? String(raw[nameKey] ?? '').trim() : '';
    const symbol = (symbolKey ? String(raw[symbolKey] ?? '').trim() : name).toUpperCase();
    const isin = isinKey ? String(raw[isinKey] ?? '').trim().toUpperCase() : '';
    const key = symbol || isin || normalizeText(name);
    if (!key) continue;

    const qty = qtyKey ? toNumber(raw[qtyKey]) : 0;
    const txnValue = valueKey ? toNumber(raw[valueKey]) : 0;
    if (qty <= 0) continue;

    let group = groups.get(key);
    if (!group) {
      group = {
        name,
        symbol,
        isin,
        currency: currencyKey ? String(raw[currencyKey] ?? 'INR').trim() || 'INR' : 'INR',
        qty: 0,
        invested: 0,
      };
      groups.set(key, group);
    }

    if (type === 'buy') {
      group.qty += qty;
      group.invested += txnValue;
    } else {
      const avgCost = group.qty > 0 ? group.invested / group.qty : 0;
      const sellQty = Math.min(qty, group.qty);
      group.qty -= sellQty;
      group.invested -= sellQty * avgCost;
      if (group.qty <= 0.0001) {
        group.qty = 0;
        group.invested = 0;
      }
    }
  }

  const result: ParsedRow[] = [];
  for (const g of groups.values()) {
    if (g.qty <= 0) continue;
    const avgCost = g.invested / g.qty;
    result.push({
      raw: {},
      name: g.name || g.symbol,
      value: g.invested,
      assetClass: 'stock',
      currency: g.currency,
      valid: (g.name.length > 0 || g.symbol.length > 0) && g.qty > 0,
      symbol: g.symbol || undefined,
      isin: g.isin || undefined,
      quantity: g.qty,
      avgCost: avgCost > 0 ? avgCost : undefined,
      investedValue: g.invested > 0 ? g.invested : undefined,
    });
  }
  return result;
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
export interface ParseOptions {
  /** Currency for sheets that carry no currency column (e.g. Vested / IBKR = USD). */
  currency?: string;
  /** Asset class for rows the parser can't classify on its own (e.g. MFCentral = mutual funds). */
  defaultClass?: AssetClass;
}

/**
 * Interactive Brokers Activity Statements are one multi-section CSV: every
 * line starts with the section name and a Header/Data marker. Rebuild just
 * the "Open Positions" table as a normal header + rows grid.
 */
function extractIbkrOpenPositions(aoa: unknown[][]): unknown[][] | null {
  const header = aoa.find((r) => r[0] === 'Open Positions' && r[1] === 'Header');
  if (!header) return null;
  const cols = header.slice(2).map((c) => String(c ?? ''));
  const data = aoa
    .filter(
      (r) =>
        r[0] === 'Open Positions' &&
        r[1] === 'Data' &&
        (String(r[2] ?? '') === 'Summary' || String(r[2] ?? '') === '')
    )
    .map((r) => r.slice(2));
  return data.length ? [cols, ...data] : null;
}

export async function parseSpreadsheetFile(file: File, options: ParseOptions = {}): Promise<ParsedRow[]> {
  const XLSX = await import('xlsx');
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

    const ibkr = extractIbkrOpenPositions(aoa);
    let candidateRows: Record<string, unknown>[];
    if (ibkr) {
      const [cols, ...body] = ibkr;
      candidateRows = body.map((r) => {
        const o: Record<string, unknown> = {};
        (cols as string[]).forEach((c, i) => {
          if (c) o[c] = r[i] ?? '';
        });
        return o;
      });
    } else {
      const headerRowIndex = detectHeaderRowIndex(aoa);
      candidateRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        range: headerRowIndex,
      });
    }

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
  const equitySignals = squashedSet(EQUITY_EXPORT_SIGNALS);
  const looksLikeMfExport = normalizedHeaders.some((h) =>
    ['schemename', 'scheme', 'foliono', 'folio', 'fundname', 'avgnav', 'purchasenav'].includes(squashHeader(h))
  );

  const nameKey = findHeaderKey(headers, NAME_HEADERS);
  // Several columns can look like "value" (invested vs current). Prefer the
  // current/market one, then any non-invested one, and invested only as a last resort.
  const valueCandidates = headers.filter((h) => squashedSet(VALUE_HEADERS).has(squashHeader(h)));
  const valueKey =
    valueCandidates.find((h) => /current|market|cur|present|closing|valuation/.test(squashHeader(h))) ??
    valueCandidates.find((h) => !/invest|cost|buy|purchase|principal/.test(squashHeader(h))) ??
    valueCandidates[0];
  const currencyKey = findHeaderKey(headers, CURRENCY_HEADERS);
  const qtyKey = findHeaderKey(headers, QTY_HEADERS);
  const isinKey = findHeaderKey(headers, ISIN_HEADERS);
  // A distinct trading-symbol column (Groww's order history has both
  // "Stock name" and "Symbol"). Falls back to nameKey further down when
  // there isn't one, matching how a Zerodha-style sheet works today (its
  // single "Symbol"/"Instrument" column serves as both).
  const symbolColKey = findHeaderKey(headers, SYMBOL_HEADERS);

  // A "Type" column is ambiguous: some sheets use it for asset category
  // (Stock/Gold/FD), others (order/transaction histories) use it for
  // Buy/Sell. Sniff the actual values before trusting the header name.
  const txnTypeKey = findTransactionTypeKey(headers, rows);

  if (txnTypeKey) {
    return aggregateTransactionRows(rows, {
      nameKey,
      symbolKey: symbolColKey,
      isinKey,
      qtyKey,
      valueKey,
      txnTypeKey,
      statusKey: findHeaderKey(headers, ORDER_STATUS_HEADERS),
      dateKey: findHeaderKey(headers, EXECUTION_DATE_HEADERS),
      currencyKey,
    });
  }

  // txnTypeKey is undefined here (handled above), so a "Type" column at
  // this point is safe to treat as an asset-class column.
  const classKey = findHeaderKey(headers, CLASS_HEADERS);
  const ltpKey = findHeaderKey(headers, PRICE_HEADERS);
  const avgPriceKey = findHeaderKey(headers, AVG_PRICE_HEADERS);
  const priceKey = ltpKey ?? avgPriceKey;
  const investedKey = findHeaderKey(headers, INVESTED_HEADERS);
  const pnlKey = findHeaderKey(headers, PNL_HEADERS);
  const pnlPercentKey = findHeaderKey(headers, PNL_PERCENT_HEADERS);

  // No asset-class column at all, but the sheet clearly looks like a
  // broker holdings export -> treat every row as equity by default.
  const looksLikeEquityExport =
    !classKey && normalizedHeaders.some((h) => equitySignals.has(squashHeader(h)));

  const dataRows = rows.filter((raw) => {
    const probes = [nameKey, symbolColKey]
      .filter((k): k is string => !!k)
      .map((k) => String(raw[k] ?? '').trim())
      .concat(nameKey || symbolColKey ? [] : [String(Object.values(raw)[0] ?? '').trim()]);
    return !probes.some((v) => TOTAL_ROW_RE.test(v));
  });

  return dataRows.map((raw) => {
    let name = nameKey ? String(raw[nameKey] ?? '').trim() : '';
    // Prefer a distinct trading-symbol column when the sheet has one
    // separate from the display name (e.g. Groww's "Symbol" next to
    // "Stock name"); otherwise fall back to the name itself, matching
    // sheets (like Zerodha's) where one column serves as both.
    const symbol = (symbolColKey ? String(raw[symbolColKey] ?? '').trim() : name).toUpperCase();
    // Sheets with only a symbol column: show the symbol rather than dropping the row.
    if (!name && symbol) name = symbol;

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

    const isinRaw = isinKey ? String(raw[isinKey] ?? '').trim().toUpperCase() : '';
    const detectedClass = classKey ? guessAssetClass(raw[classKey]) : undefined;
    let assetClass: AssetClass;
    if (detectedClass) {
      assetClass = detectedClass;
    } else if (/\b(etf|bees)\b|bees$/i.test(name) || /\bETF\b/i.test(name)) {
      assetClass = 'etf';
    } else if (isinRaw.startsWith('INF') || looksLikeMfExport) {
      assetClass = 'equity_mutual_fund';
    } else if (looksLikeEquityExport || isinRaw.startsWith('INE')) {
      assetClass = 'stock';
    } else {
      assetClass = options.defaultClass ?? 'other';
    }

    const currency = currencyKey
      ? String(raw[currencyKey] ?? '').trim() || options.currency || 'INR'
      : options.currency || 'INR';

    // Invested value: prefer explicit column, else Qty x Avg. cost (full decimal precision).
    let investedValue = investedKey ? toNumber(raw[investedKey]) : 0;
    if (investedValue <= 0 && quantity && quantity > 0 && avgCost && avgCost > 0) {
      investedValue = quantity * avgCost;
    }

    // No current value/price in the file: fall back to what was invested so the row still imports.
    if (value <= 0 && investedValue > 0) value = investedValue;

    // P&L: prefer an explicit column, else derive from value - invested.
    let pnl = pnlKey ? numOrUndef(raw[pnlKey]) : undefined;
    if (pnl === undefined && investedValue > 0 && value > 0) {
      pnl = value - investedValue;
    }

    let pnlPercent = pnlPercentKey ? numOrUndef(raw[pnlPercentKey]) : undefined;
    if (pnlPercent === undefined && pnl !== undefined && investedValue > 0) {
      pnlPercent = (pnl / investedValue) * 100;
    }

    const hasSymbol = looksLikeEquityExport || assetClass === 'stock' || assetClass === 'etf';
    const isin = isinRaw;

    return {
      raw,
      name,
      value,
      assetClass,
      currency,
      valid: name.length > 0 && value > 0,
      symbol: hasSymbol && symbol ? symbol : undefined,
      isin: isin || undefined,
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
