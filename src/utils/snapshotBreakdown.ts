import type { Asset } from '../types';
import { ASSET_TAXONOMY } from './taxonomy';
import { resolveAssetValues } from './assetValues';
import { isFullySold } from './investmentPnl';

/** One row of a snapshot's "where was the money" split. */
export interface BreakdownGroup {
  key: string;
  label: string;
  color: string;
}

const STOCK_CLASSES = new Set(['stock', 'etf', 'international_equity', 'esop_rsu', 'equity_other', 'ipo_pre_ipo']);
const FUND_CLASSES = new Set(['equity_mutual_fund', 'index_fund', 'hybrid_mutual_fund']);

const catColor = (key: string) => ASSET_TAXONOMY.find((c) => c.key === key)?.color ?? '#64748b';

/** Display order. Equity is split into Stocks / Mutual funds / SIP; the rest follow the taxonomy categories. */
export const BREAKDOWN_GROUPS: BreakdownGroup[] = [
  { key: 'stocks', label: 'Stocks & ETFs', color: '#247a4d' },
  { key: 'mutual_funds', label: 'Mutual funds', color: '#2f9e63' },
  { key: 'sip', label: 'SIP', color: '#5cc08a' },
  { key: 'debt', label: 'Debt', color: catColor('debt') },
  { key: 'real_estate', label: 'Real estate', color: catColor('real_estate') },
  { key: 'commodities', label: 'Commodities', color: catColor('commodities') },
  { key: 'cash', label: 'Cash & savings', color: catColor('cash') },
  { key: 'crypto', label: 'Crypto', color: catColor('crypto') },
  { key: 'alternatives', label: 'Alternatives', color: catColor('alternatives') },
  { key: 'other', label: 'Other', color: catColor('other') },
];

export function breakdownKeyFor(assetClass: string): string {
  if (assetClass === 'sip') return 'sip';
  if (STOCK_CLASSES.has(assetClass)) return 'stocks';
  if (FUND_CLASSES.has(assetClass)) return 'mutual_funds';
  for (const cat of ASSET_TAXONOMY) {
    if (cat.types.some((t) => t.value === assetClass)) return cat.key === 'equity' ? 'stocks' : cat.key;
  }
  return 'other';
}

/**
 * Current value of every (not fully sold) holding, grouped. Only non-zero groups
 * are included, and values are rounded to paise — so the object is safe to write
 * to Firestore as-is.
 */
export function computeBreakdown(
  assets: Asset[],
  livePrices: Parameters<typeof resolveAssetValues>[1],
  sipValues: Parameters<typeof resolveAssetValues>[2],
  goldPricePerGram: Parameters<typeof resolveAssetValues>[3]
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const a of assets) {
    if (isFullySold(a)) continue;
    const v = resolveAssetValues(a, livePrices, sipValues, goldPricePerGram).value;
    const k = breakdownKeyFor(a.assetClass);
    out[k] = (out[k] ?? 0) + v;
  }
  for (const k of Object.keys(out)) {
    out[k] = Math.round(out[k] * 100) / 100;
    if (!out[k]) delete out[k];
  }
  return out;
}

export function breakdownsEqual(a: Record<string, number> | undefined, b: Record<string, number>): boolean {
  if (!a) return Object.keys(b).length === 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (Math.abs((a[k] ?? 0) - (b[k] ?? 0)) >= 0.5) return false;
  return true;
}
