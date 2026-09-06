import type { Asset } from '../types';
import { resolveLivePrice, resolveSipLiveValue, type SipLiveEntry } from '../store/livePricesStore';
import { goldPricePerGram22k } from './goldPrice';
import { DEPOSIT_LIKE_CLASSES } from './taxonomy';

export interface ResolvedAssetValues {
  invested: number | undefined;
  currentPrice: number | undefined;
  value: number;
  pnl: number | undefined;
  pnlPercent: number | undefined;
  isLive: boolean;
}

/**
 * Compute display values for an asset, applying live prices when available.
 * `sipValues` holds the auto-calculated Current Value for linked SIPs
 * (refreshed in the background by useLiveSipValues), keyed by mfapi.in
 * scheme code — the same value the SIP edit form computes on the fly, kept
 * current everywhere the asset is shown instead of only while editing.
 * `goldPricePerGram` is the live 24K rate polled by useLiveGoldPrice
 * (see livePricesStore.goldPricePerGram) — used to keep Gold holdings'
 * Current Value / Return tracking the live rate everywhere the asset is
 * shown, the same way `livePrices` does for equities/ETFs.
 */
export function resolveAssetValues(
  asset: Asset,
  livePrices: Record<string, number>,
  sipValues: Record<string, SipLiveEntry> = {},
  goldPricePerGram: number | null = null
): ResolvedAssetValues {
  const isSipLinked = asset.assetClass === 'sip' && !!asset.symbol && /^\d+$/.test(asset.symbol);
  const liveSip = isSipLinked ? resolveSipLiveValue(asset.symbol, sipValues) : undefined;

  const livePrice = resolveLivePrice(asset.symbol, livePrices);

  // Gold holdings aren't priced via `symbol` (there's no ticker) — they're
  // weight-tracked, so the live per-gram rate is scaled by the saved
  // purity (defaulting to 24K for older entries with no purity saved) and
  // multiplied by grams held, mirroring the auto-fill math in the Wealth
  // add/edit form's Gold Purity picker.
  const isGold = asset.assetClass === 'gold';
  const liveGoldPrice =
    isGold && goldPricePerGram !== null
      ? asset.goldPurity === '22k'
        ? goldPricePerGram22k(goldPricePerGram)
        : goldPricePerGram
      : undefined;

  const isLive = liveSip !== undefined || livePrice !== undefined || liveGoldPrice !== undefined;

  // Deposit-like assets (FD, RD, PPF, bonds, etc.) don't have a live market
  // price — but they do accrue interest daily, so their "Current Value"
  // shouldn't sit frozen at the number typed in when the asset was added.
  // Falls back to the stored asset.value/investedValue when there isn't
  // enough info (missing rate/start date) so older entries keep working.
  const isDepositLike = DEPOSIT_LIKE_CLASSES.has(asset.assetClass);
  const depositProgress = isDepositLike ? computeDepositProgress(asset) : undefined;

  const currentPrice =
    liveSip?.latestNav ??
    livePrice ??
    liveGoldPrice ??
    (asset.quantity && asset.quantity > 0 ? asset.value / asset.quantity : undefined);

  const invested =
    asset.assetClass === 'sip' && asset.sipAmount && asset.sipAmount > 0 && asset.startDate
      ? computeSipProgress(asset).totalInvested
      : (depositProgress?.invested ??
        asset.investedValue ??
        (asset.quantity && asset.avgCost && asset.quantity > 0 && asset.avgCost > 0
          ? asset.quantity * asset.avgCost
          : undefined));

  const value = liveSip
    ? liveSip.value
    : liveGoldPrice !== undefined && asset.quantity && asset.quantity > 0
      ? asset.quantity * liveGoldPrice
      : livePrice !== undefined && asset.quantity && asset.quantity > 0
        ? asset.quantity * livePrice
        : (depositProgress?.currentValue ?? asset.value);

  const pnl = invested !== undefined ? value - invested : asset.pnl;
  const pnlPercent =
    pnl !== undefined && invested && invested > 0 ? (pnl / invested) * 100 : asset.pnlPercent;

  return { invested, currentPrice, value, pnl, pnlPercent, isLive };
}

export interface DepositProgress {
  /** Today's accrued value — quarterly compound interest from each contribution's 
   *  own date up to today (or up to maturity, once matured). This is what
   *  "Current Value" should show for a deposit, and it updates itself
   *  every time the page loads/re-renders since `asOf` defaults to now —
   *  no scheduled job needed, same self-refreshing pattern as SIP progress. */
  currentValue: number | undefined;
  /** Total principal contributed so far (lump sum for FD/PPF/bonds, or the
   *  running sum of installments made so far for a Recurring Deposit). */
  invested: number | undefined;
  isMatured: boolean;
}

/**
 * Computes a deposit-like asset's (FD, RD, PPF, bonds, etc.) accrued value
 * as of today, so "Current Value" reflects interest earned so far instead
 * of sitting frozen at whatever was typed in when the asset was added.
 * Uses quarterly compound interest (standard for FD/RD in India), the same
 * method as `computeMaturityInfo`, just measured from the deposit date to 
 * `asOf` instead of to the full maturity date — so today's figure and the 
 * maturity projection stay consistent with each other, just at different 
 * points on the same curve.
 *
 * Once `maturityDate` has passed, the value is held flat at the maturity
 * amount rather than continuing to accrue forever, since a matured
 * deposit left un-withdrawn typically stops earning the original rate.
 *
 * Recurring Deposits are handled installment-by-installment: each monthly
 * installment starts earning interest from its own deposit date, so an
 * RD's current value is the sum of every installment's own accrued value.
 */
export function computeDepositProgress(asset: Asset, asOf: Date = new Date()): DepositProgress {
  const { startDate, maturityDate, interestRate, assetClass } = asset;
  const maturityTime = maturityDate ? new Date(maturityDate).getTime() : undefined;
  const isMatured = maturityTime !== undefined && maturityTime <= asOf.getTime();

  if (!startDate || !interestRate || interestRate <= 0) {
    return { currentValue: undefined, invested: undefined, isMatured };
  }

  const msPerDay = 24 * 60 * 60 * 1000;
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const effectiveAsOf = isMatured ? new Date(maturityTime!) : asOf;

  if (assetClass === 'recurring_deposit' && asset.monthlyInstallment && asset.monthlyInstallment > 0) {
    const start = new Date(startDate);
    let currentValue = 0;
    let invested = 0;
    let candidate = new Date(start);
    while (
      candidate.getTime() <= effectiveAsOf.getTime() &&
      (maturityTime === undefined || candidate.getTime() <= maturityTime)
    ) {
      // Count only COMPLETE days
      const completeDbsElapsed = Math.floor((effectiveAsOf.getTime() - candidate.getTime()) / msPerDay);
      invested += asset.monthlyInstallment;
      // Use quarterly compound interest for complete days only
      const yearsElapsed = completeDbsElapsed / 365.25;
      currentValue +=
        yearsElapsed > 0
          ? asset.monthlyInstallment * Math.pow(1 + interestRate / 400, yearsElapsed * 4)
          : asset.monthlyInstallment;
      candidate = shiftMonths(candidate.getFullYear(), candidate.getMonth(), start.getDate(), 1);
    }
    return {
      currentValue: invested > 0 ? currentValue : undefined,
      invested: invested > 0 ? invested : undefined,
      isMatured,
    };
  }

  const principal = asset.investedValue ?? asset.value;
  if (!principal || principal <= 0) {
    return { currentValue: undefined, invested: undefined, isMatured };
  }

  // Count only COMPLETE days
  const completeDaysElapsed = Math.floor((effectiveAsOf.getTime() - new Date(startDate).getTime()) / msPerDay);
  const yearsElapsed = completeDaysElapsed / 365.25;
  // Use quarterly compound interest for complete days only
  const currentValue =
    yearsElapsed > 0 ? principal * Math.pow(1 + interestRate / 400, yearsElapsed * 4) : principal;

  return { currentValue, invested: principal, isMatured };
}

export interface MaturityInfo {
  /** Quarterly compound interest projected value at maturity, computed over 
   *  the full start-date-to-maturity-date term (not "today to maturity"). 
   *  Uses standard FD/RD calculation with interest compounded quarterly. */
  maturityAmount: number | undefined;
  /** True once the maturity date has passed. */
  isMatured: boolean;
}

/**
 * Computes the projected maturity amount for a deposit-like asset (FD, RD,
 * bond, etc.) using quarterly compound interest over the full term — from 
 * `startDate` to `maturityDate`. This matches standard FD/RD calculation 
 * in India where interest is compounded quarterly (4 times per year).
 * Returns `undefined` for `maturityAmount` when there isn't enough info 
 * (missing dates/rate/principal).
 */
export function computeMaturityInfo(asset: Asset): MaturityInfo {
  const { startDate, maturityDate, interestRate } = asset;
  const isMatured = !!maturityDate && new Date(maturityDate).getTime() <= Date.now();

  if (!startDate || !maturityDate || !interestRate || interestRate <= 0) {
    return { maturityAmount: undefined, isMatured };
  }

  const principal = asset.investedValue ?? asset.value;
  if (!principal || principal <= 0) {
    return { maturityAmount: undefined, isMatured };
  }

  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  const termYears =
    (new Date(maturityDate).getTime() - new Date(startDate).getTime()) / msPerYear;
  if (termYears <= 0) {
    return { maturityAmount: undefined, isMatured };
  }

  // Use quarterly compound interest (standard for FD/RD in India)
  // Formula: A = P(1 + r/400)^(4t)
  // where r is annual rate and t is years
  const maturityAmount = principal * Math.pow(1 + interestRate / 400, termYears * 4);
  return { maturityAmount, isMatured };
}

export interface SipProgress {
  /** Initial lump sum + every installment counted as due on/before today. */
  totalInvested: number;
  /** Number of installments counted as elapsed so far. */
  installmentsElapsed: number;
  /** ISO date (yyyy-mm-dd) of the next upcoming installment, if any. Undefined while paused. */
  nextInstallmentDate: string | undefined;
  /** True while the SIP is currently paused (asset.sipPausedAt is set). */
  isPaused: boolean;
}

/** A [start, end] window (ms epoch, inclusive) during which a SIP was paused
 *  and no installments should be counted. */
interface PauseRange {
  start: number;
  end: number;
}

/** Builds every paused window for a SIP: closed cycles from
 *  `sipPauseHistory`, plus the currently-open one (if any) from
 *  `sipPausedAt` through `asOf`. */
function buildSipPauseRanges(
  sipPauseHistory: { pausedAt: string; resumedAt: string }[] | undefined,
  sipPausedAt: string | undefined,
  asOf: Date
): PauseRange[] {
  const ranges: PauseRange[] = (sipPauseHistory ?? [])
    .filter((h) => h.pausedAt && h.resumedAt)
    .map((h) => ({ start: new Date(h.pausedAt).getTime(), end: new Date(h.resumedAt).getTime() }));
  if (sipPausedAt) {
    ranges.push({ start: new Date(sipPausedAt).getTime(), end: asOf.getTime() });
  }
  return ranges;
}

function isWithinPauseRanges(isoDate: string, ranges: PauseRange[]): boolean {
  const t = new Date(isoDate).getTime();
  return ranges.some((r) => t >= r.start && t <= r.end);
}

/**
 * The installment amount that was actually in effect on `isoDate`, given a
 * history of amount changes. Falls back to `currentAmount` when the SIP's
 * amount has never changed (no schedule), and to the earliest recorded
 * amount for dates before the first recorded change.
 */
function effectiveSipAmount(
  sipAmountSchedule: { amount: number; effectiveFrom: string }[] | undefined,
  currentAmount: number,
  isoDate: string
): number {
  if (!sipAmountSchedule || sipAmountSchedule.length === 0) return currentAmount;
  const t = new Date(isoDate).getTime();
  const sorted = [...sipAmountSchedule].sort(
    (a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime()
  );
  let best = sorted[0];
  for (const entry of sorted) {
    if (new Date(entry.effectiveFrom).getTime() <= t) best = entry;
  }
  return best.amount;
}

/** Returns a date shifted by `months`, clamped to the last day of the
 *  target month so e.g. day 31 lands on Feb 28/29 instead of spilling
 *  into March. */
export function shiftMonths(year: number, month: number, day: number, months: number): Date {
  const total = month + months;
  const targetYear = year + Math.floor(total / 12);
  const targetMonth = ((total % 12) + 12) % 12;
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  return new Date(targetYear, targetMonth, Math.min(day, daysInMonth));
}

/**
 * Counts SIP installments due from `startDate` through today (or `asOf`)
 * and adds them to the initial investment — so the "invested so far"
 * figure keeps itself current every time the page is opened, without
 * needing any scheduled job. `sipDay` is clamped to each month's real
 * length (e.g. 31 becomes the 28th/29th in February).
 */
export function computeSipProgress(asset: Asset, asOf: Date = new Date()): SipProgress {
  const initial = asset.investedValue ?? 0;
  const {
    startDate,
    sipAmount,
    sipFrequency = 'monthly',
    sipDay,
    sipPausedAt,
    sipPauseHistory,
    sipAmountSchedule,
    sipTopUps,
  } = asset;
  const isPaused = !!sipPausedAt;
  const topUpsTotal = (sipTopUps ?? []).reduce((sum, t) => sum + (t.amount || 0), 0);

  if (!startDate || !sipAmount || sipAmount <= 0) {
    return {
      totalInvested: initial + topUpsTotal,
      installmentsElapsed: 0,
      nextInstallmentDate: undefined,
      isPaused,
    };
  }

  const start = new Date(startDate);
  const day = sipDay && sipDay >= 1 && sipDay <= 31 ? sipDay : start.getDate();
  const step = sipFrequency === 'quarterly' ? 3 : 1;
  const pauseRanges = buildSipPauseRanges(sipPauseHistory, sipPausedAt, asOf);

  let candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, 0);
  if (candidate < start) {
    candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, step);
  }

  let installmentsElapsed = 0;
  let installmentsTotal = 0;
  while (candidate.getTime() <= asOf.getTime()) {
    const iso = candidate.toISOString().slice(0, 10);
    if (!isWithinPauseRanges(iso, pauseRanges)) {
      installmentsElapsed++;
      installmentsTotal += effectiveSipAmount(sipAmountSchedule, sipAmount, iso);
    }
    candidate = shiftMonths(candidate.getFullYear(), candidate.getMonth(), day, step);
  }

  const nextInstallmentDate = isPaused ? undefined : candidate.toISOString().slice(0, 10);
  const totalInvested = initial + installmentsTotal + topUpsTotal;
  return { totalInvested, installmentsElapsed, nextInstallmentDate, isPaused };
}

export interface SipInstallmentPoint {
  /** ISO date (yyyy-mm-dd) the installment (or initial lumpsum) was made. */
  date: string;
  amount: number;
}

/**
 * Lists every SIP installment due on or before `asOf` — the initial lumpsum
 * (if any) on `startDate`, followed by each periodic installment. Mirrors
 * the date-stepping logic in `computeSipProgress` so unit-purchase math
 * stays consistent with the "invested so far" figure. Used to buy fund
 * units at the NAV in effect on each installment date, so a SIP's current
 * value can be derived automatically instead of typed in by hand.
 */
export function listSipInstallments(
  asset: Pick<
    Asset,
    | 'startDate'
    | 'sipAmount'
    | 'sipFrequency'
    | 'sipDay'
    | 'investedValue'
    | 'sipPausedAt'
    | 'sipPauseHistory'
    | 'sipAmountSchedule'
    | 'sipTopUps'
  >,
  asOf: Date = new Date()
): SipInstallmentPoint[] {
  const {
    startDate,
    sipAmount,
    sipFrequency = 'monthly',
    sipDay,
    investedValue,
    sipPausedAt,
    sipPauseHistory,
    sipAmountSchedule,
    sipTopUps,
  } = asset;
  if (!startDate || !sipAmount || sipAmount <= 0) return [];

  const points: SipInstallmentPoint[] = [];
  if (investedValue && investedValue > 0) {
    points.push({ date: startDate, amount: investedValue });
  }

  const start = new Date(startDate);
  const day = sipDay && sipDay >= 1 && sipDay <= 31 ? sipDay : start.getDate();
  const step = sipFrequency === 'quarterly' ? 3 : 1;
  const pauseRanges = buildSipPauseRanges(sipPauseHistory, sipPausedAt, asOf);

  let candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, 0);
  if (candidate < start) {
    candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, step);
  }

  while (candidate.getTime() <= asOf.getTime()) {
    const iso = candidate.toISOString().slice(0, 10);
    if (!isWithinPauseRanges(iso, pauseRanges)) {
      points.push({ date: iso, amount: effectiveSipAmount(sipAmountSchedule, sipAmount, iso) });
    }
    candidate = shiftMonths(candidate.getFullYear(), candidate.getMonth(), day, step);
  }

  for (const t of sipTopUps ?? []) {
    if (t.date && t.amount > 0) points.push({ date: t.date, amount: t.amount });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}
