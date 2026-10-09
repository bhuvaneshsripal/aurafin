/** X/2 · X/3 valuation: pure calculation + fundamentals fetch. */

export interface FundamentalsResponse {
  symbol: string;
  name: string | null;
  price: number | null;
  ttmEps: number | null;
  forwardEps: number | null;
  growth: { nextYear: number | null; next5y: number | null };
  epsHistory: { date: string; eps: number }[];
  lowestPe: { value: number; date: string; from: string; to: string; points: number; spanYears: number; method: string } | null;
  priceHistoryYears: number | null;
  source: string;
  asOf: string;
}

export async function fetchFundamentals(symbol: string, exchange: 'NSE' | 'BSE'): Promise<FundamentalsResponse> {
  const res = await fetch(`/api/market/valuation?symbol=${encodeURIComponent(symbol)}&exchange=${exchange}`);
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try { msg = (await res.json())?.error ?? msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  return res.json();
}

/** CAGR over annual EPS history (oldest -> newest). Null when not meaningful. */
export function epsCagr(history: number[]): number | null {
  if (history.length < 2) return null;
  const first = history[0], last = history[history.length - 1];
  if (!(first > 0) || !(last > 0)) return null;
  return (Math.pow(last / first, 1 / (history.length - 1)) - 1) * 100;
}

export interface ValuationInput {
  price: number;
  eps: number;
  exceptional: number;
  growthPct: number;
  dilutionPct: number;
  lowestPe: number;
  years: number;
  lookbackYears: number;
  requiredReturnPct: number;
  roundEps: boolean;
  manualEps?: number[];
  /** Optional 5th-year (final-year) EPS entered directly, e.g. an analyst estimate. Overrides growth. */
  finalYearEps?: number;
  cyclical: boolean;
  weakPe: boolean;
  userProvided: boolean;
  /** Number of P/E readings / years of history behind the lowest P/E (when auto-filled). */
  peReadings?: number;
  peSpanYears?: number;
  growthNote?: string;
}

/** discountPct: how far CMP sits below the level, (level − price) ÷ level × 100.
 *  Positive = CMP trades at a discount to the level; negative = a premium.
 *  upsidePct is the other way round: (level − price) ÷ price × 100. */
export interface Level { key: 'X' | 'X/2' | 'X/3'; target: number; diff: number; upsidePct: number; discountPct: number }
export interface Adequate { target: number; diff: number; upsidePct: number; discountPct: number; factor: number }
export interface ValuationResult {
  errors: string[];
  warnings: string[];
  baseEps: number;
  projected: number[];
  x: number;
  levels: Level[];
  adequate: Adequate | null;
  currentPe: number | null;
  /** True when the inputs are too thin to trust the headline numbers. */
  lowConfidence: boolean;
  /** Growth rate the projection actually used (equals the input unless a final-year EPS was entered). */
  usedGrowthPct: number;
}

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function computeValuation(i: ValuationInput): ValuationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const years = Math.round(i.years);
  const baseEps = i.eps - i.exceptional;
  const empty: ValuationResult = { errors, warnings, baseEps, projected: [], x: NaN, levels: [], adequate: null, currentPe: null, lowConfidence: false, usedGrowthPct: NaN };

  if (!(years >= 1 && years <= 10)) errors.push('Projection years must be a whole number from 1 to 10.');
  if (!Number.isFinite(i.eps)) errors.push('Enter the current (TTM) EPS.');
  else if (i.eps <= 0) errors.push('EPS is zero or negative, so a P/E-based projection does not apply to this company.');
  else if (!(baseEps > 0)) errors.push('EPS after removing exceptional items is not positive. Enter a normalised positive EPS.');
  if (!Number.isFinite(i.lowestPe)) errors.push('Enter the lowest historical P/E.');
  else if (i.lowestPe <= 0) errors.push('Lowest P/E must be positive. Negative or zero P/E values are not valid.');
  if (!(i.requiredReturnPct >= 0)) errors.push('Enter a required annual return of 0% or more (the video uses 15%).');
  const override = i.finalYearEps !== undefined && Number.isFinite(i.finalYearEps);
  if (override && !((i.finalYearEps as number) > 0)) errors.push('Final-year EPS must be positive.');
  if (!i.manualEps && !override && !Number.isFinite(i.growthPct)) errors.push('Enter the expected EPS growth rate, or the final-year EPS.');
  if (i.manualEps && i.manualEps.slice(0, years).some((v) => !(v > 0))) errors.push('Enter a positive EPS estimate for every year.');
  if (errors.length) return empty;

  const projected: number[] = [];
  let prev = baseEps;
  // A final-year EPS entered by the person wins: spread it evenly (constant implied growth).
  const implied = override ? (Math.pow((i.finalYearEps as number) / baseEps, 1 / years) - 1) * 100 : NaN;
  const usedGrowthPct = override ? implied : i.growthPct;
  for (let n = 0; n < years; n++) {
    let v = i.manualEps
      ? i.manualEps[n]
      : override
        ? n === years - 1 ? (i.finalYearEps as number) : baseEps * Math.pow(1 + implied / 100, n + 1)
        : (prev * (1 + i.growthPct / 100)) / (1 + i.dilutionPct / 100);
    if (i.roundEps) v = r2(v);
    projected.push(v);
    prev = v;
  }
  const x = projected[years - 1] * i.lowestPe;
  const levels = (['X', 'X/2', 'X/3'] as const).map((key, idx) => {
    const target = x / [1, 2, 3][idx];
    return { key, target, diff: target - i.price, upsidePct: i.price > 0 ? ((target - i.price) / i.price) * 100 : NaN, discountPct: i.price > 0 ? ((target - i.price) / target) * 100 : NaN };
  });
  // Adequate buying price = X ÷ (1 + required return)^years: the price today that would
  // grow to X in N years at the required return. At 15% over 5 years the factor is 2.01, i.e. ≈ X/2.
  const factor = Math.pow(1 + i.requiredReturnPct / 100, years);
  const at = x / factor;
  const adequate: Adequate = { target: at, factor, diff: at - i.price, upsidePct: i.price > 0 ? ((at - i.price) / i.price) * 100 : NaN, discountPct: i.price > 0 ? ((at - i.price) / at) * 100 : NaN };
  const currentPe = i.price > 0 ? i.price / i.eps : null;

  if (override) warnings.push(`Year-${years} EPS (${(i.finalYearEps as number).toFixed(2)}) was entered by you; it implies ${implied.toFixed(1)}% EPS growth a year from ${baseEps.toFixed(2)}.`);
  if (!i.manualEps && !override && i.growthPct > 30) warnings.push('Growth above 30% a year is rarely sustained for long. The result is optimistic.');
  if (!i.manualEps && !override && i.growthPct < 0) warnings.push('Negative growth is assumed, so projected EPS falls each year.');
  if (i.lowestPe < 6) warnings.push('Lowest P/E is very low (below 6). It may reflect peak earnings, distress or bad data.');
  if (i.weakPe) warnings.push('The lowest P/E is flagged as based on unusually weak earnings, so X may be unreliable.');
  let lowConfidence = false;
  if (i.peReadings !== undefined && (i.peReadings < 12 || (i.peSpanYears ?? 0) < 2)) {
    lowConfidence = true;
  } else if (i.lookbackYears < 5) warnings.push('The P/E history covers under 5 years, so a full cycle may be missing. 5–10 years is preferred.');
  if (i.cyclical) warnings.push('Cyclical business: current EPS may be at a peak or trough. Use mid-cycle EPS where possible.');
  if (i.exceptional !== 0) warnings.push('Base EPS excludes exceptional items you entered.');
  if (i.dilutionPct > 0) warnings.push(`Share dilution of ${i.dilutionPct}% a year is applied to EPS growth.`);
  if (!(i.price > 0)) warnings.push('Enter a current price to see upside or downside.');
  return { errors, warnings, baseEps, projected, x, levels, adequate, currentPe, lowConfidence, usedGrowthPct };
}

export const inr = (n: number) =>
  Number.isFinite(n)
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
    : '—';
export const signedPct = (n: number) => (Number.isFinite(n) ? `${n >= 0 ? '+' : ''}${n.toFixed(1)}%` : '—');
