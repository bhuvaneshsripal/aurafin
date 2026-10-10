/**
 * Portfolio analytics — allocation, drift/rebalancing and concentration risk.
 * Pure functions: callers pass already-resolved values so this stays testable
 * and consistent with the numbers shown on Wealth / Dashboard.
 */
import type { Asset } from '../types';
import { ASSET_CLASS_TO_CATEGORY } from './taxonomy';

export interface ValuedAsset {
  asset: Asset;
  value: number;
}

export interface CategorySlice {
  key: string;
  label: string;
  color: string;
  value: number;
  /** 0-100 */
  pct: number;
}

export const CATEGORY_KEYS = ['equity', 'debt', 'real_estate', 'commodities', 'cash', 'crypto', 'alternatives', 'other'] as const;
export type CategoryKey = (typeof CATEGORY_KEYS)[number];
export type TargetAllocation = Partial<Record<CategoryKey, number>>;

export const CATEGORY_META: Record<CategoryKey, { label: string; color: string }> = {
  equity: { label: 'Equity', color: '#16a35d' },
  debt: { label: 'Debt', color: '#3b82f6' },
  real_estate: { label: 'Real Estate', color: '#4ade93' },
  commodities: { label: 'Commodities', color: '#f5b942' },
  cash: { label: 'Cash & Savings', color: '#94a3b8' },
  crypto: { label: 'Crypto', color: '#f97316' },
  alternatives: { label: 'Alternatives', color: '#8b5cf6' },
  other: { label: 'Other', color: '#64748b' },
};

export const TARGET_PRESETS: { id: string; label: string; description: string; targets: TargetAllocation }[] = [
  { id: 'aggressive', label: 'Aggressive', description: 'Growth-first, long horizon', targets: { equity: 70, debt: 10, real_estate: 5, commodities: 7, cash: 5, crypto: 3 } },
  { id: 'balanced', label: 'Balanced', description: 'Growth with a solid debt cushion', targets: { equity: 50, debt: 25, real_estate: 10, commodities: 8, cash: 7 } },
  { id: 'conservative', label: 'Conservative', description: 'Capital preservation first', targets: { equity: 25, debt: 45, real_estate: 10, commodities: 10, cash: 10 } },
];

export function categoryOf(asset: Asset): CategoryKey {
  const key = ASSET_CLASS_TO_CATEGORY[asset.assetClass]?.key as CategoryKey | undefined;
  return key && key in CATEGORY_META ? key : 'other';
}

export function buildAllocation(items: ValuedAsset[]): { total: number; slices: CategorySlice[] } {
  const total = items.reduce((s, i) => s + Math.max(0, i.value), 0);
  const sums = new Map<CategoryKey, number>();
  for (const i of items) {
    const k = categoryOf(i.asset);
    sums.set(k, (sums.get(k) ?? 0) + Math.max(0, i.value));
  }
  const slices = CATEGORY_KEYS.filter((k) => (sums.get(k) ?? 0) > 0).map((k) => ({
    key: k,
    label: CATEGORY_META[k].label,
    color: CATEGORY_META[k].color,
    value: sums.get(k) ?? 0,
    pct: total > 0 ? ((sums.get(k) ?? 0) / total) * 100 : 0,
  }));
  slices.sort((a, b) => b.value - a.value);
  return { total, slices };
}

export interface DriftRow {
  key: CategoryKey;
  label: string;
  color: string;
  currentValue: number;
  currentPct: number;
  targetPct: number;
  /** current − target, in percentage points. */
  driftPct: number;
  /** Amount to move to hit the target (positive = buy, negative = sell). */
  adjust: number;
  status: 'on_track' | 'over' | 'under';
}

export function targetSum(targets: TargetAllocation): number {
  return CATEGORY_KEYS.reduce((s, k) => s + (targets[k] ?? 0), 0);
}

/** Drift of the current allocation against the targets. `band` is the ± tolerance in points. */
export function computeDrift(slices: CategorySlice[], total: number, targets: TargetAllocation, band = 5): DriftRow[] {
  const byKey = new Map(slices.map((s) => [s.key, s]));
  const rows: DriftRow[] = [];
  for (const k of CATEGORY_KEYS) {
    const cur = byKey.get(k);
    const targetPct = targets[k] ?? 0;
    if (!cur && targetPct <= 0) continue;
    const currentPct = cur?.pct ?? 0;
    const driftPct = currentPct - targetPct;
    rows.push({
      key: k,
      label: CATEGORY_META[k].label,
      color: CATEGORY_META[k].color,
      currentValue: cur?.value ?? 0,
      currentPct,
      targetPct,
      driftPct,
      adjust: (targetPct / 100) * total - (cur?.value ?? 0),
      status: Math.abs(driftPct) <= band ? 'on_track' : driftPct > 0 ? 'over' : 'under',
    });
  }
  return rows.sort((a, b) => Math.abs(b.driftPct) - Math.abs(a.driftPct));
}

/**
 * Cash-flow rebalancing: split `newMoney` across the underweight categories
 * (proportional to each one's shortfall) so no selling — and therefore no tax
 * event — is needed. Returns per-category amounts; leftover (if every category
 * is already at/above target) is spread by target weight.
 */
export function allocateNewMoney(rows: DriftRow[], total: number, newMoney: number, targets: TargetAllocation): Record<string, number> {
  const out: Record<string, number> = {};
  if (newMoney <= 0) return out;
  const after = total + newMoney;
  const shortfalls = rows.map((r) => ({ key: r.key, gap: Math.max(0, (r.targetPct / 100) * after - r.currentValue) }));
  const totalGap = shortfalls.reduce((s, r) => s + r.gap, 0);
  if (totalGap > 0) {
    const scale = Math.min(1, newMoney / totalGap);
    for (const s of shortfalls) if (s.gap > 0) out[s.key] = s.gap * scale;
    const used = Object.values(out).reduce((a, b) => a + b, 0);
    const left = newMoney - used;
    if (left > 0.5) {
      const tsum = targetSum(targets) || 1;
      for (const k of CATEGORY_KEYS) if ((targets[k] ?? 0) > 0) out[k] = (out[k] ?? 0) + (left * (targets[k] ?? 0)) / tsum;
    }
  } else {
    const tsum = targetSum(targets) || 1;
    for (const k of CATEGORY_KEYS) if ((targets[k] ?? 0) > 0) out[k] = (newMoney * (targets[k] ?? 0)) / tsum;
  }
  return out;
}

// ---------------------------------------------------------------- risk

export interface HoldingWeight {
  asset: Asset;
  value: number;
  pct: number;
}

export type RiskSeverity = 'high' | 'medium' | 'low' | 'ok';
export interface RiskFlag {
  severity: RiskSeverity;
  title: string;
  detail: string;
}

export interface RiskReport {
  total: number;
  holdings: HoldingWeight[];
  top5Pct: number;
  /** Herfindahl-Hirschman index of holding weights, 0-1. */
  hhi: number;
  /** Effective number of equally-sized holdings (1/HHI). */
  effectiveHoldings: number;
  /** 0-100, higher is better diversified. */
  score: number;
  grade: 'Excellent' | 'Good' | 'Fair' | 'Poor';
  flags: RiskFlag[];
}

export function computeRisk(items: ValuedAsset[], slices: CategorySlice[], liquidValue = 0): RiskReport {
  const positive = items.filter((i) => i.value > 0);
  const total = positive.reduce((s, i) => s + i.value, 0);
  const holdings = positive
    .map((i) => ({ asset: i.asset, value: i.value, pct: total > 0 ? (i.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value);

  const hhi = holdings.reduce((s, h) => s + (h.pct / 100) ** 2, 0);
  const effectiveHoldings = hhi > 0 ? 1 / hhi : 0;
  const top5Pct = holdings.slice(0, 5).reduce((s, h) => s + h.pct, 0);
  const catHhi = slices.reduce((s, c) => s + (c.pct / 100) ** 2, 0);

  // Score: holding-level spread (60%) + asset-class spread (40%).
  const holdingScore = Math.min(1, Math.max(0, (effectiveHoldings - 1) / 14)); // 15 effective holdings = full marks
  const classScore = Math.min(1, Math.max(0, (1 / (catHhi || 1) - 1) / 3)); // 4 effective classes = full marks
  const score = total > 0 ? Math.round((holdingScore * 0.6 + classScore * 0.4) * 100) : 0;
  const grade = score >= 80 ? 'Excellent' : score >= 60 ? 'Good' : score >= 40 ? 'Fair' : 'Poor';

  const flags: RiskFlag[] = [];
  const biggest = holdings[0];
  if (biggest && biggest.pct > 25) {
    flags.push({ severity: 'high', title: `${biggest.asset.name} is ${biggest.pct.toFixed(0)}% of your portfolio`, detail: 'A single position above 25% means one bad event can move your whole net worth. Consider trimming toward 10-15%.' });
  } else if (biggest && biggest.pct > 15) {
    flags.push({ severity: 'medium', title: `${biggest.asset.name} is ${biggest.pct.toFixed(0)}% of your portfolio`, detail: 'Above the usual 10-15% single-position guideline.' });
  }
  const topCat = slices[0];
  if (topCat && topCat.key !== 'real_estate' && topCat.pct > 75) {
    flags.push({ severity: 'high', title: `${topCat.label} makes up ${topCat.pct.toFixed(0)}% of your assets`, detail: 'Heavily concentrated in one asset class. Spreading across classes smooths the ride.' });
  } else if (topCat && topCat.pct > 60) {
    flags.push({ severity: 'medium', title: `${topCat.label} makes up ${topCat.pct.toFixed(0)}% of your assets`, detail: 'Leaning on one asset class; check this is deliberate.' });
  }
  const crypto = slices.find((s) => s.key === 'crypto');
  if (crypto && crypto.pct > 10) {
    flags.push({ severity: 'medium', title: `Crypto is ${crypto.pct.toFixed(0)}% of assets`, detail: 'Very volatile; most plans cap it around 5-10%.' });
  }
  if (holdings.length > 0 && holdings.length < 5) {
    flags.push({ severity: 'low', title: `Only ${holdings.length} holding${holdings.length === 1 ? '' : 's'}`, detail: 'A broad index fund or ETF can add instant diversification.' });
  }
  if (total > 0 && liquidValue / total < 0.05) {
    flags.push({ severity: 'low', title: 'Low liquidity', detail: `Only ${((liquidValue / total) * 100).toFixed(1)}% sits in cash, FDs or liquid funds, which could be tight in an emergency.` });
  }
  if (flags.length === 0 && total > 0) {
    flags.push({ severity: 'ok', title: 'No concentration issues found', detail: 'Your holdings and asset classes are reasonably spread.' });
  }
  return { total, holdings, top5Pct, hhi, effectiveHoldings, score, grade, flags };
}
