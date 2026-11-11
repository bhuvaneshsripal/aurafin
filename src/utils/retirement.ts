/**
 * Retirement drawdown simulator (the second half of FIRE). Starts from a corpus,
 * withdraws inflation-adjusted expenses every year and checks whether the money
 * lasts, using the same seeded lognormal Monte Carlo as the accumulation
 * projection. Sequence-of-returns risk is captured because each run draws its
 * own order of good and bad years.
 */
import { makeNormal, mulberry32, quantile } from './projection';

export interface RetirementInput {
  corpus: number;
  /** Yearly spending in today's money. */
  annualExpenseToday: number;
  /** Years between now and the first withdrawal; expenses are inflated through them. */
  yearsToRetire: number;
  /** Years the money must last after retiring. */
  retirementYears: number;
  returnPct: number;
  volPct: number;
  inflationPct: number;
  /** Other income in today's money while retired (pension, rent), per year. */
  otherIncomeToday?: number;
  simulations?: number;
  seed?: number;
}

export interface RetirementPoint {
  year: number;
  p10: number;
  p50: number;
  p90: number;
}

export interface RetirementResult {
  points: RetirementPoint[];
  /** Probability (0-1) the corpus is never exhausted before the end. */
  successProb: number;
  /** Year (into retirement) by which 10% of runs have run out, or undefined if fewer than 10% do. */
  p10DepletionYear: number | undefined;
  /** First-year withdrawal as % of the corpus. */
  initialWithdrawalPct: number;
  /** First year's withdrawal in the rupees of that year. */
  firstWithdrawal: number;
}

function drawParams(returnPct: number, volPct: number) {
  const mean = returnPct / 100;
  const sd = Math.max(0, volPct / 100);
  const sigma2 = Math.log(1 + (sd * sd) / ((1 + mean) * (1 + mean)));
  return { mu: Math.log(1 + mean) - sigma2 / 2, sigma: Math.sqrt(sigma2) };
}

export function runRetirement(inp: RetirementInput): RetirementResult {
  const sims = inp.simulations ?? 2000;
  const years = Math.max(1, Math.min(60, Math.round(inp.retirementYears)));
  const rand = mulberry32(inp.seed ?? 20260811);
  const normal = makeNormal(rand);
  const { mu, sigma } = drawParams(inp.returnPct, inp.volPct);
  const infl = 1 + inp.inflationPct / 100;
  const need0 = Math.max(0, inp.annualExpenseToday - (inp.otherIncomeToday ?? 0)) * Math.pow(infl, Math.max(0, inp.yearsToRetire));

  const paths: Float64Array[] = [];
  const ranOutAt = new Int16Array(sims).fill(-1);
  for (let s = 0; s < sims; s++) {
    const path = new Float64Array(years + 1);
    let v = inp.corpus;
    path[0] = v;
    let need = need0;
    for (let y = 1; y <= years; y++) {
      // Withdraw at the start of the year, then the remainder earns that year's return.
      v = Math.max(0, v - need);
      if (v <= 0 && ranOutAt[s] < 0) ranOutAt[s] = y;
      v = v * Math.exp(mu + sigma * normal());
      path[y] = v;
      need *= infl;
    }
    paths.push(path);
  }

  const points: RetirementPoint[] = [];
  for (let y = 0; y <= years; y++) {
    const col = paths.map((p) => p[y]).sort((a, b) => a - b);
    points.push({ year: y, p10: quantile(col, 0.1), p50: quantile(col, 0.5), p90: quantile(col, 0.9) });
  }
  const failed = Array.from(ranOutAt).filter((y) => y >= 0).sort((a, b) => a - b);
  const p10Idx = Math.floor(sims * 0.1);
  return {
    points,
    successProb: 1 - failed.length / sims,
    p10DepletionYear: failed.length > p10Idx ? failed[p10Idx] : undefined,
    initialWithdrawalPct: inp.corpus > 0 ? (need0 / inp.corpus) * 100 : 0,
    firstWithdrawal: need0,
  };
}

/** Largest first-year withdrawal (today's money) that still succeeds in `confidence` of runs. */
export function sustainableSpend(inp: RetirementInput, confidence = 0.9): number {
  let lo = 0;
  let hi = Math.max(inp.annualExpenseToday * 3, inp.corpus * 0.2);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const r = runRetirement({ ...inp, annualExpenseToday: mid, otherIncomeToday: 0, simulations: 600 });
    if (r.successProb >= confidence) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Coast FIRE: the corpus needed TODAY that, with no further contributions,
 * grows to `fiNumberToday` (inflated to retirement) by the retirement date.
 */
export function coastNumber(fiNumberToday: number, yearsToRetire: number, returnPct: number, inflationPct: number): number {
  const realGrowth = (1 + returnPct / 100) / (1 + inflationPct / 100);
  return fiNumberToday / Math.pow(realGrowth, Math.max(0, yearsToRetire));
}
