/**
 * India capital-gains report built from each holding's buy lots and sale
 * records. Tax matching uses FIFO (the rule for listed shares / MF units),
 * so a sale's holding period comes from the lots it actually consumed — the
 * Performance page's moving-average P&L is unaffected.
 *
 * Rates are those in force from 23-Jul-2024 (Budget 2024) and are an
 * ESTIMATE, not tax advice. They're centralised in TAX_RULES so they're
 * easy to update when the law changes.
 */
import type { Asset, AssetClass } from '../types';
import type { HoldingPnl } from './investmentPnl';

export type TaxGroup = 'equity' | 'long24' | 'crypto' | 'slab';

export interface TaxRule {
  group: TaxGroup;
  label: string;
  /** Days held for the gain to count as long-term. */
  ltDays: number;
  /** Short-term rate in %. `null` = taxed at the user's slab rate. */
  stcgRate: number | null;
  ltcgRate: number | null;
  /** Annual LTCG exemption applies to this group. */
  exemption: boolean;
}

export const LTCG_EXEMPTION = 125000;

export const TAX_RULES: Record<TaxGroup, TaxRule> = {
  equity: { group: 'equity', label: 'Listed equity & equity funds', ltDays: 365, stcgRate: 20, ltcgRate: 12.5, exemption: true },
  long24: { group: 'long24', label: 'Gold, silver & foreign equity', ltDays: 730, stcgRate: null, ltcgRate: 12.5, exemption: false },
  crypto: { group: 'crypto', label: 'Crypto & NFTs (VDA)', ltDays: Infinity, stcgRate: 30, ltcgRate: 30, exemption: false },
  slab: { group: 'slab', label: 'Other (taxed at slab rate)', ltDays: Infinity, stcgRate: null, ltcgRate: null, exemption: false },
};

const EQUITY_CLASSES = new Set<AssetClass>(['stock', 'etf', 'equity_mutual_fund', 'index_fund', 'hybrid_mutual_fund', 'sip', 'ipo_pre_ipo', 'equity_other']);
const LONG24_CLASSES = new Set<AssetClass>(['international_equity', 'gold', 'silver', 'platinum', 'esop_rsu']);
const CRYPTO_CLASSES = new Set<AssetClass>(['crypto_coin', 'nft']);

export function taxGroupOf(assetClass: AssetClass): TaxGroup {
  if (EQUITY_CLASSES.has(assetClass)) return 'equity';
  if (LONG24_CLASSES.has(assetClass)) return 'long24';
  if (CRYPTO_CLASSES.has(assetClass)) return 'crypto';
  return 'slab';
}

/** Indian financial year label for an ISO date, e.g. 2026-05-01 -> "FY 2026-27". */
export function financialYearOf(iso: string): string {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const start = m >= 4 ? y : y - 1;
  return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export function currentFinancialYear(now = new Date()): string {
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  return financialYearOf(iso);
}

function daysBetween(fromIso: string, toIso: string): number {
  const a = Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10));
  const b = Date.UTC(+toIso.slice(0, 4), +toIso.slice(5, 7) - 1, +toIso.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

export interface GainSlice {
  assetId: string;
  assetName: string;
  assetClass: AssetClass;
  group: TaxGroup;
  currency: string;
  buyDate: string | undefined;
  sellDate: string | undefined;
  qty: number;
  cost: number;
  proceeds: number;
  gain: number;
  daysHeld: number | undefined;
  term: 'short' | 'long';
  /** Date unknown on a buy or sell lot; term assumed short. */
  assumed: boolean;
  fy: string | undefined;
}

interface OpenLot {
  date: string | undefined;
  qty: number;
  price: number;
}

/**
 * Walks buys/sells in date order with FIFO matching. Returns realised slices
 * (one per sale x consumed lot) and the lots still open.
 */
export function fifoMatch(h: HoldingPnl): { realised: GainSlice[]; open: OpenLot[] } {
  const a: Asset = h.asset;
  const group = taxGroupOf(a.assetClass);
  const rule = TAX_RULES[group];
  type Ev = { t: 'buy' | 'sell'; date: string | undefined; sort: string; qty: number; price: number; fees: number };
  const evs: Ev[] = [
    ...h.buyLots.map((l, i) => ({ t: 'buy' as const, date: l.date, sort: l.date ?? `0000-${String(i).padStart(4, '0')}`, qty: l.qty, price: l.price, fees: 0 })),
    ...h.sales.map((s, i) => ({ t: 'sell' as const, date: s.date, sort: s.date ?? `9999-${String(i).padStart(4, '0')}`, qty: s.quantity, price: s.sellPrice, fees: s.fees })),
  ].sort((x, y) => (x.sort === y.sort ? (x.t === 'buy' ? -1 : 1) : x.sort.localeCompare(y.sort)));

  const open: OpenLot[] = [];
  const realised: GainSlice[] = [];
  for (const e of evs) {
    if (e.t === 'buy') {
      open.push({ date: e.date, qty: e.qty, price: e.price });
      continue;
    }
    let remaining = e.qty;
    const feePerUnit = e.qty > 0 ? e.fees / e.qty : 0;
    while (remaining > 1e-9 && open.length > 0) {
      const lot = open[0];
      const take = Math.min(lot.qty, remaining);
      const days = lot.date && e.date ? daysBetween(lot.date, e.date) : undefined;
      const assumed = days === undefined;
      const term: 'short' | 'long' = days !== undefined && days > rule.ltDays ? 'long' : 'short';
      const cost = take * lot.price;
      const proceeds = take * (e.price - feePerUnit);
      realised.push({
        assetId: a.id,
        assetName: a.name,
        assetClass: a.assetClass,
        group,
        currency: a.currency,
        buyDate: lot.date,
        sellDate: e.date,
        qty: take,
        cost,
        proceeds,
        gain: proceeds - cost,
        daysHeld: days,
        term,
        assumed,
        fy: e.date ? financialYearOf(e.date) : undefined,
      });
      lot.qty -= take;
      remaining -= take;
      if (lot.qty <= 1e-9) open.shift();
    }
  }
  return { realised, open };
}

export interface FyGroupSummary {
  group: TaxGroup;
  rule: TaxRule;
  stcg: number;
  ltcg: number;
  /** After set-off of losses (STCL vs LTCG; LTCL only vs LTCG). */
  netStcg: number;
  netLtcg: number;
  exemptionUsed: number;
  taxableStcg: number;
  taxableLtcg: number;
  tax: number;
  /** True when part of the tax uses the user's slab rate. */
  usesSlab: boolean;
}

export interface FySummary {
  fy: string;
  groups: FyGroupSummary[];
  totalGain: number;
  totalTax: number;
  slices: GainSlice[];
}

export function summariseFy(fy: string, slices: GainSlice[], slabRate: number): FySummary {
  const groups: FyGroupSummary[] = [];
  for (const g of Object.keys(TAX_RULES) as TaxGroup[]) {
    const rule = TAX_RULES[g];
    const gs = slices.filter((s) => s.group === g);
    if (gs.length === 0) continue;
    const stcg = gs.filter((s) => s.term === 'short').reduce((a, s) => a + s.gain, 0);
    const ltcg = gs.filter((s) => s.term === 'long').reduce((a, s) => a + s.gain, 0);

    let netStcg = stcg;
    let netLtcg = ltcg;
    if (g === 'crypto') {
      // VDA losses can't be set off against anything.
      netStcg = Math.max(0, stcg);
      netLtcg = Math.max(0, ltcg);
    } else {
      if (netStcg < 0 && netLtcg > 0) {
        const off = Math.min(-netStcg, netLtcg);
        netLtcg -= off;
        netStcg += off;
      }
    }
    const exemptionUsed = rule.exemption ? Math.min(LTCG_EXEMPTION, Math.max(0, netLtcg)) : 0;
    const taxableStcg = Math.max(0, netStcg);
    const taxableLtcg = Math.max(0, netLtcg - exemptionUsed);
    const stRate = rule.stcgRate ?? slabRate;
    const ltRate = rule.ltcgRate ?? slabRate;
    const tax = (taxableStcg * stRate) / 100 + (taxableLtcg * ltRate) / 100;
    groups.push({
      group: g,
      rule,
      stcg,
      ltcg,
      netStcg,
      netLtcg,
      exemptionUsed,
      taxableStcg,
      taxableLtcg,
      tax,
      usesSlab: (rule.stcgRate === null && taxableStcg > 0) || (rule.ltcgRate === null && taxableLtcg > 0),
    });
  }
  return {
    fy,
    groups,
    slices,
    totalGain: slices.reduce((s, x) => s + x.gain, 0),
    totalTax: groups.reduce((s, g) => s + g.tax, 0),
  };
}

export interface UnrealisedLot {
  asset: Asset;
  group: TaxGroup;
  qty: number;
  buyDate: string | undefined;
  cost: number;
  value: number;
  gain: number;
  term: 'short' | 'long';
  /** Days until a short-term lot turns long-term (undefined if already long / unknown). */
  daysToLong: number | undefined;
}

export function unrealisedLots(h: HoldingPnl, today: string): UnrealisedLot[] {
  if (h.currentPrice === undefined) return [];
  const group = taxGroupOf(h.asset.assetClass);
  const rule = TAX_RULES[group];
  return fifoMatch(h).open.map((l) => {
    const days = l.date ? daysBetween(l.date, today) : undefined;
    const term: 'short' | 'long' = days !== undefined && days > rule.ltDays ? 'long' : 'short';
    const cost = l.qty * l.price;
    const value = l.qty * (h.currentPrice as number);
    return {
      asset: h.asset,
      group,
      qty: l.qty,
      buyDate: l.date,
      cost,
      value,
      gain: value - cost,
      term,
      daysToLong: days !== undefined && term === 'short' && Number.isFinite(rule.ltDays) ? rule.ltDays + 1 - days : undefined,
    };
  });
}
