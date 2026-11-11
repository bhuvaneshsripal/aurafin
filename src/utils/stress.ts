/**
 * Stress tests and parametric risk for the current mix. Scenario shocks are
 * rough, round-number assumptions per asset class (not forecasts), and VaR uses
 * the same class volatilities and uniform correlation as the projection.
 */
import { CLASS_ASSUMPTIONS, suggestAssumptions } from './projection';
import type { CategoryKey, CategorySlice } from './portfolioAnalytics';

export interface StressScenario {
  id: string;
  label: string;
  description: string;
  /** Percentage change per asset class; missing classes are unchanged. */
  shocks: Partial<Record<CategoryKey, number>>;
}

export const STRESS_SCENARIOS: StressScenario[] = [
  { id: 'crash', label: 'Equity crash', description: 'Like 2008 or Mar 2020: stocks fall hard, gold and bonds hold up.', shocks: { equity: -35, crypto: -55, alternatives: -25, real_estate: -8, commodities: 5, debt: 2 } },
  { id: 'bear', label: 'Slow bear market', description: 'A long grind lower across risk assets.', shocks: { equity: -20, crypto: -40, alternatives: -15, real_estate: -5, commodities: 0 } },
  { id: 'rates', label: 'Rate spike', description: 'Yields jump; bond funds and property lose value.', shocks: { equity: -10, debt: -4, real_estate: -10, commodities: -3 } },
  { id: 'inflation', label: 'Inflation shock', description: 'Prices surge; cash and bonds lose purchasing power, hard assets cope.', shocks: { equity: -8, debt: -3, cash: -6, commodities: 12, real_estate: 4 } },
  { id: 'crypto', label: 'Crypto winter', description: 'Digital assets collapse while the rest is calm.', shocks: { crypto: -75 } },
];

export interface StressResult {
  scenario: StressScenario;
  /** Rupee change in portfolio value (negative = loss). */
  change: number;
  changePct: number;
  /** Class that contributes the largest loss. */
  worstClass: string | undefined;
}

export function runStress(slices: CategorySlice[], total: number): StressResult[] {
  return STRESS_SCENARIOS.map((scenario) => {
    let change = 0;
    let worst: { label: string; loss: number } | undefined;
    for (const s of slices) {
      const d = (s.value * (scenario.shocks[s.key as CategoryKey] ?? 0)) / 100;
      change += d;
      if (d < 0 && (!worst || d < -worst.loss)) worst = { label: s.label, loss: -d };
    }
    return { scenario, change, changePct: total > 0 ? (change / total) * 100 : 0, worstClass: worst?.label };
  });
}

export interface VarResult {
  /** Annual volatility of the whole mix, %. */
  volPct: number;
  /** Loss (positive number) not expected to be exceeded in 95% of years / months. */
  var95Year: number;
  var95Month: number;
  /** Average loss in the worst 5% of years (expected shortfall). */
  cvar95Year: number;
}

/** z for the 95% one-sided normal quantile, and E[loss | worst 5%] factor = phi(z)/0.05. */
const Z95 = 1.645;
const ES95 = 2.063;

export function parametricVar(slices: CategorySlice[], total: number): VarResult {
  const { vol, ret } = { vol: suggestAssumptions(slices).vol, ret: suggestAssumptions(slices).ret };
  const sdY = vol / 100;
  const muY = ret / 100;
  return {
    volPct: vol,
    var95Year: Math.max(0, total * (Z95 * sdY - muY)),
    var95Month: Math.max(0, total * (Z95 * (sdY / Math.sqrt(12)) - muY / 12)),
    cvar95Year: Math.max(0, total * (ES95 * sdY - muY)),
  };
}

export interface RiskContribution {
  key: string;
  label: string;
  color: string;
  weightPct: number;
  /** Share of total portfolio variance, %. */
  riskPct: number;
}

const RHO = 0.35;

/** How much of the portfolio's risk each asset class is responsible for. */
export function riskContributions(slices: CategorySlice[], total: number): RiskContribution[] {
  if (total <= 0) return [];
  const w = slices.map((s) => ({ s, w: s.value / total, vol: (CLASS_ASSUMPTIONS[s.key as CategoryKey]?.vol ?? 10) / 100 }));
  const cov = (i: number, j: number) => w[i].vol * w[j].vol * (i === j ? 1 : RHO);
  let variance = 0;
  for (let i = 0; i < w.length; i++) for (let j = 0; j < w.length; j++) variance += w[i].w * w[j].w * cov(i, j);
  if (variance <= 0) return [];
  return w
    .map((x, i) => {
      let marginal = 0;
      for (let j = 0; j < w.length; j++) marginal += w[j].w * cov(i, j);
      return { key: x.s.key, label: x.s.label, color: x.s.color, weightPct: x.w * 100, riskPct: ((x.w * marginal) / variance) * 100 };
    })
    .sort((a, b) => b.riskPct - a.riskPct);
}
