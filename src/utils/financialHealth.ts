import type { Asset, AssetClass } from '../types';
import { resolveAssetValues } from './assetValues';
import type { SipLiveEntry } from '../store/livePricesStore';

/** Asset classes counted as "liquid" for the Emergency Fund runway. */
const LIQUID_CLASSES: AssetClass[] = ['cash', 'fixed_deposit', 'recurring_deposit', 'debt_mutual_fund', 'treasury_bill'];

export function computeLiquidAssets(
  assets: Asset[],
  livePrices: Record<string, number>,
  sipValues: Record<string, SipLiveEntry>
): number {
  return assets
    .filter((a) => LIQUID_CLASSES.includes(a.assetClass))
    .reduce((sum, a) => sum + resolveAssetValues(a, livePrices, sipValues).value, 0);
}

export type RiskLevel = 'risky' | 'good' | 'perfect';

export function emergencyFundStatus(runwayMonths: number): RiskLevel {
  if (runwayMonths < 3) return 'risky';
  if (runwayMonths < 6) return 'good';
  return 'perfect';
}

export function savingsRateStatus(rate: number): RiskLevel {
  if (rate < 0.1) return 'risky';
  if (rate < 0.2) return 'good';
  return 'perfect';
}

export function debtRatioStatus(ratio: number): RiskLevel {
  if (ratio > 0.5) return 'risky';
  if (ratio > 0.3) return 'good';
  return 'perfect';
}

export function coverStatus(cover: number, ideal: number): RiskLevel {
  if (ideal <= 0) return 'perfect';
  const pct = cover / ideal;
  if (pct < 0.5) return 'risky';
  if (pct < 1) return 'good';
  return 'perfect';
}

/**
 * Years to financial independence for a given savings rate, using the
 * standard FIRE approximation (25x annual expenses, ~5% real returns).
 * Interpolated from the widely-cited savings-rate table (Mr. Money
 * Mustache's "Shockingly Simple Math Behind Early Retirement").
 */
const FI_TABLE: [number, number][] = [
  [0, 999],
  [0.05, 66],
  [0.1, 51],
  [0.15, 43],
  [0.2, 37],
  [0.25, 32],
  [0.3, 28],
  [0.35, 25],
  [0.4, 22],
  [0.45, 19],
  [0.5, 17],
  [0.55, 14.5],
  [0.6, 12.5],
  [0.65, 10.5],
  [0.7, 8.5],
  [0.75, 7],
  [0.8, 5.5],
  [0.85, 4],
  [0.9, 2.5],
  [0.95, 1],
  [1, 0],
];

export function yearsToFI(savingsRate: number): number {
  const rate = Math.max(0, Math.min(1, savingsRate));
  for (let i = 0; i < FI_TABLE.length - 1; i++) {
    const [r0, y0] = FI_TABLE[i];
    const [r1, y1] = FI_TABLE[i + 1];
    if (rate >= r0 && rate <= r1) {
      if (r1 === r0) return y0;
      const t = (rate - r0) / (r1 - r0);
      return Math.round((y0 + t * (y1 - y0)) * 10) / 10;
    }
  }
  return 0;
}

export function idealTermCover(annualExpense: number, netWorth: number): number {
  return Math.max(0, 25 * annualExpense - netWorth);
}

/** Overall 0-10 health score, averaged from each component's 0-10 sub-score. */
export function overallHealthScore(subScores: number[]): number {
  if (subScores.length === 0) return 0;
  const avg = subScores.reduce((s, v) => s + v, 0) / subScores.length;
  return Math.round(avg * 10) / 10;
}

export function scoreLabel(score: number): string {
  if (score < 4) return 'Needs Attention';
  if (score < 7) return 'Getting There';
  if (score < 9) return 'Doing Well';
  return 'Excellent';
}

export const RISK_STYLES: Record<RiskLevel, { label: string; dot: string; text: string }> = {
  risky: { label: 'Risky', dot: 'bg-red-500', text: 'text-red-600 dark:text-red-400' },
  good: { label: 'Good', dot: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
  perfect: { label: 'Perfect', dot: 'bg-brand-500', text: 'text-brand-600 dark:text-brand-400' },
};
