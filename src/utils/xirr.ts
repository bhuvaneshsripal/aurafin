/**
 * XIRR — the annualised, money-weighted return of a series of dated cash flows.
 *
 * It is the rate `r` that makes the net present value of every flow zero:
 *
 *     Σ  amount_i / (1 + r) ^ ((date_i − date_first) / 365)  =  0
 *
 * Same definition as Excel / Google Sheets XIRR (actual days ÷ 365), so the number can be
 * checked against a spreadsheet. Sign convention: money you put in is NEGATIVE, money you get
 * back (a sale, or today's value of what you still hold) is POSITIVE.
 *
 * Why not Newton's method from a fixed guess (what the Calculators page and the per-holding
 * view did): it can wander off to a wrong or no answer for very high / very negative returns or
 * for flows that change sign more than once. This solver instead scans the whole sensible range
 * for a sign change in the NPV, takes the root closest to 0%, then narrows it by bisection, so
 * it always lands on a real root to full precision or says plainly that there isn't one.
 */

export interface CashFlow {
  /** A calendar day: a `yyyy-mm-dd` string (read as that local day) or a Date (its local day). */
  date: string | Date;
  /** Negative = money invested, positive = money received / current value. */
  amount: number;
}

const MS_PER_DAY = 86_400_000;
const DAYS_PER_YEAR = 365;

/** Whole days since the epoch for a calendar day, ignoring time of day and time zone. NaN if invalid. */
export function dayNumber(date: string | Date): number {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!m) return NaN;
    const y = +m[1];
    const mo = +m[2];
    const d = +m[3];
    // Reject impossible dates like 2026-02-31 instead of letting Date.UTC roll them over.
    const t = Date.UTC(y, mo - 1, d);
    const check = new Date(t);
    if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return NaN;
    return t / MS_PER_DAY;
  }
  if (Number.isNaN(date.getTime())) return NaN;
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / MS_PER_DAY;
}

/**
 * Annualised return as a fraction (0.123 = 12.3% a year), or null when it can't be worked out:
 * fewer than two flows, no money out or no money back, an invalid date or amount, or no rate
 * between −99.97% and +2,980,000% that balances the flows.
 */
export function xirr(flows: CashFlow[]): number | null {
  // Fold flows that fall on the same day into one; the order inside a day doesn't matter.
  const byDay = new Map<number, number>();
  for (const f of flows) {
    const day = dayNumber(f.date);
    if (!Number.isFinite(day) || !Number.isFinite(f.amount)) return null;
    if (f.amount === 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + f.amount);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);
  const amounts = days.map((d) => byDay.get(d) as number).filter((a) => a !== 0);
  const liveDays = days.filter((d) => byDay.get(d) !== 0);
  if (liveDays.length < 2) return null;
  if (!amounts.some((a) => a > 0) || !amounts.some((a) => a < 0)) return null;

  const t = liveDays.map((d) => (d - liveDays[0]) / DAYS_PER_YEAR);

  // Work in x = ln(1 + r): NPV(x) = Σ a_i · e^(−x·t_i). Smooth, and r > −100% always holds.
  const npv = (x: number) => {
    let s = 0;
    for (let i = 0; i < amounts.length; i++) s += amounts[i] * Math.exp(-x * t[i]);
    return s;
  };

  // Scan for sign changes. Step 0.05 in x is ~5% in (1 + r) — fine enough not to jump over a
  // pair of close roots in practice, coarse enough to stay cheap (about 320 evaluations).
  const X_MIN = -8;
  const X_MAX = 8;
  const STEP = 0.05;
  let best: { lo: number; hi: number; flo: number } | null = null;
  let prevX = X_MIN;
  let prevF = npv(prevX);
  if (prevF === 0) return Math.expm1(prevX);
  for (let x = X_MIN + STEP; x <= X_MAX + 1e-9; x += STEP) {
    const f = npv(x);
    if (f === 0) {
      if (best === null || Math.abs(x) < Math.abs(nearest(best))) best = { lo: x, hi: x, flo: 0 };
    } else if ((f < 0) !== (prevF < 0) && prevF !== 0) {
      const cand = { lo: prevX, hi: x, flo: prevF };
      // Several roots are possible when flows change sign more than once; report the one
      // closest to 0%, which is what a person comparing returns expects.
      if (best === null || Math.abs(nearest(cand)) < Math.abs(nearest(best))) best = cand;
    }
    prevX = x;
    prevF = f;
  }
  if (best === null) return null;
  if (best.lo === best.hi) return Math.expm1(best.lo);

  let { lo, hi } = best;
  const flo = best.flo;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    const fm = npv(mid);
    if (fm === 0) {
      lo = hi = mid;
      break;
    }
    if ((fm < 0) === (flo < 0)) lo = mid;
    else hi = mid;
    if (hi - lo < 1e-14) break;
  }
  return Math.expm1((lo + hi) / 2);
}

/** The point of a bracket nearest to x = 0 (so we can prefer the root closest to 0%). */
function nearest(b: { lo: number; hi: number }): number {
  if (b.lo <= 0 && b.hi >= 0) return 0;
  return Math.abs(b.lo) < Math.abs(b.hi) ? b.lo : b.hi;
}
