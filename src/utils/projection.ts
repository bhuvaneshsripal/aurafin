/**
 * Monte Carlo net-worth projection. Annual returns are drawn from a lognormal
 * distribution with the given mean/volatility, using a seeded RNG so results
 * are stable between renders (same inputs -> same chart).
 */
import type { CategoryKey, CategorySlice } from './portfolioAnalytics';

/** Long-run, nominal INR-ish assumptions per class: expected return and volatility (%). */
export const CLASS_ASSUMPTIONS: Record<CategoryKey, { ret: number; vol: number }> = {
  equity: { ret: 12, vol: 17 },
  debt: { ret: 7, vol: 3 },
  real_estate: { ret: 8, vol: 8 },
  commodities: { ret: 8, vol: 14 },
  cash: { ret: 4, vol: 1 },
  crypto: { ret: 15, vol: 65 },
  alternatives: { ret: 12, vol: 30 },
  other: { ret: 6, vol: 10 },
};

const AVG_CORRELATION = 0.35;

/** Weighted expected return and volatility of the current mix (uniform pairwise correlation). */
export function suggestAssumptions(slices: CategorySlice[]): { ret: number; vol: number } {
  const total = slices.reduce((s, c) => s + c.value, 0);
  if (total <= 0) return { ret: 10, vol: 12 };
  const w = slices.map((s) => ({ w: s.value / total, ...CLASS_ASSUMPTIONS[s.key as CategoryKey] }));
  const ret = w.reduce((s, x) => s + x.w * x.ret, 0);
  let variance = 0;
  for (let i = 0; i < w.length; i++) {
    for (let j = 0; j < w.length; j++) {
      const rho = i === j ? 1 : AVG_CORRELATION;
      variance += w[i].w * w[j].w * w[i].vol * w[j].vol * rho;
    }
  }
  return { ret: Math.round(ret * 10) / 10, vol: Math.round(Math.sqrt(variance) * 10) / 10 };
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeNormal(rand: () => number) {
  return () => {
    let u = 0;
    while (u === 0) u = rand();
    const v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export interface ProjectionInput {
  startValue: number;
  /** Monthly contribution today. */
  monthlyContribution: number;
  /** Yearly increase of the contribution, %. */
  stepUpPct: number;
  /** Expected nominal return %, volatility %. */
  returnPct: number;
  volPct: number;
  years: number;
  inflationPct: number;
  /** Target corpus in today's money; inflated to each year's rupees internally. */
  targetToday: number;
  simulations?: number;
  seed?: number;
}

export interface ProjectionPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
  /** Deterministic path at the expected return. */
  expected: number;
  /** Target corpus inflated to this year. */
  target: number;
  contributed: number;
}

export interface ProjectionResult {
  points: ProjectionPoint[];
  /** Probability (0-1) that the end value, in nominal terms, reaches the inflated target. */
  successProb: number;
  /** Median year the target is first reached, or undefined if it isn't within the horizon. */
  medianYearsToTarget: number | undefined;
  /** Probability of reaching the target at least once within the horizon. */
  everReachedProb: number;
  finalP10: number;
  finalP50: number;
  finalP90: number;
  /** Ending median expressed in today's money. */
  finalP50Real: number;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function runProjection(inp: ProjectionInput): ProjectionResult {
  const sims = inp.simulations ?? 2000;
  const years = Math.max(1, Math.min(60, Math.round(inp.years)));
  const rand = mulberry32(inp.seed ?? 20260809);
  const normal = makeNormal(rand);

  // Lognormal parameters so the arithmetic mean return = returnPct.
  const mean = inp.returnPct / 100;
  const sd = Math.max(0, inp.volPct / 100);
  const sigma2 = Math.log(1 + (sd * sd) / ((1 + mean) * (1 + mean)));
  const mu = Math.log(1 + mean) - sigma2 / 2;
  const sigma = Math.sqrt(sigma2);

  const paths: Float64Array[] = [];
  const hit = new Int16Array(sims).fill(-1);
  const infl = 1 + inp.inflationPct / 100;

  for (let s = 0; s < sims; s++) {
    const path = new Float64Array(years + 1);
    let v = inp.startValue;
    path[0] = v;
    let contrib = inp.monthlyContribution * 12;
    for (let y = 1; y <= years; y++) {
      const r = Math.exp(mu + sigma * normal()) - 1;
      // Contributions arrive through the year: on average they earn half a year of the return.
      v = v * (1 + r) + contrib * (1 + r / 2);
      path[y] = v;
      contrib *= 1 + inp.stepUpPct / 100;
      if (hit[s] < 0 && v >= inp.targetToday * Math.pow(infl, y) && inp.targetToday > 0) hit[s] = y;
    }
    paths.push(path);
  }

  const points: ProjectionPoint[] = [];
  let expected = inp.startValue;
  let contrib = inp.monthlyContribution * 12;
  let contributed = inp.startValue;
  for (let y = 0; y <= years; y++) {
    if (y > 0) {
      expected = expected * (1 + mean) + contrib * (1 + mean / 2);
      contributed += contrib;
      contrib *= 1 + inp.stepUpPct / 100;
    }
    const col = paths.map((p) => p[y]).sort((a, b) => a - b);
    points.push({
      year: y,
      p10: quantile(col, 0.1),
      p50: quantile(col, 0.5),
      p90: quantile(col, 0.9),
      expected,
      target: inp.targetToday * Math.pow(infl, y),
      contributed,
    });
  }

  const last = points[years];
  let success = 0;
  for (let s = 0; s < sims; s++) if (paths[s][years] >= last.target && inp.targetToday > 0) success++;
  const hits = Array.from(hit).filter((h) => h >= 0).sort((a, b) => a - b);
  const everReachedProb = hits.length / sims;

  return {
    points,
    successProb: success / sims,
    medianYearsToTarget: everReachedProb >= 0.5 ? hits[Math.floor(sims / 2)] : undefined,
    everReachedProb,
    finalP10: last.p10,
    finalP50: last.p50,
    finalP90: last.p90,
    finalP50Real: last.p50 / Math.pow(infl, years),
  };
}
