import type { Asset } from '../types';
import { resolveLivePrice, resolveSipLiveValue, type SipLiveEntry } from '../store/livePricesStore';
import { goldPricePerGram22k } from './goldPrice';

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

  const currentPrice =
    liveSip?.latestNav ??
    livePrice ??
    liveGoldPrice ??
    (asset.quantity && asset.quantity > 0 ? asset.value / asset.quantity : undefined);

  const invested =
    asset.assetClass === 'sip' && asset.sipAmount && asset.sipAmount > 0 && asset.startDate
      ? computeSipProgress(asset).totalInvested
      : (asset.investedValue ??
        (asset.quantity && asset.avgCost && asset.quantity > 0 && asset.avgCost > 0
          ? asset.quantity * asset.avgCost
          : undefined));

  const value = liveSip
    ? liveSip.value
    : liveGoldPrice !== undefined && asset.quantity && asset.quantity > 0
      ? asset.quantity * liveGoldPrice
      : livePrice !== undefined && asset.quantity && asset.quantity > 0
        ? asset.quantity * livePrice
        : asset.value;

  const pnl = invested !== undefined ? value - invested : asset.pnl;
  const pnlPercent =
    pnl !== undefined && invested && invested > 0 ? (pnl / invested) * 100 : asset.pnlPercent;

  return { invested, currentPrice, value, pnl, pnlPercent, isLive };
}

export interface MaturityInfo {
  /** Simple-interest projected value at maturity, computed over the full
   *  start-date-to-maturity-date term (not "today to maturity"). */
  maturityAmount: number | undefined;
  /** True once the maturity date has passed. */
  isMatured: boolean;
}

/**
 * Computes the projected maturity amount for a deposit-like asset (FD, RD,
 * bond, etc.) using simple interest over the full term — from `startDate`
 * to `maturityDate` — rather than from today. Returns `undefined` for
 * `maturityAmount` when there isn't enough info (missing dates/rate/principal).
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

  const maturityAmount = principal * (1 + (interestRate / 100) * termYears);
  return { maturityAmount, isMatured };
}

export interface SipProgress {
  /** Initial lump sum + every installment counted as due on/before today. */
  totalInvested: number;
  /** Number of installments counted as elapsed so far. */
  installmentsElapsed: number;
  /** ISO date (yyyy-mm-dd) of the next upcoming installment, if any. */
  nextInstallmentDate: string | undefined;
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
  const { startDate, sipAmount, sipFrequency = 'monthly', sipDay } = asset;

  if (!startDate || !sipAmount || sipAmount <= 0) {
    return { totalInvested: initial, installmentsElapsed: 0, nextInstallmentDate: undefined };
  }

  const start = new Date(startDate);
  const day = sipDay && sipDay >= 1 && sipDay <= 31 ? sipDay : start.getDate();
  const step = sipFrequency === 'quarterly' ? 3 : 1;

  let candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, 0);
  if (candidate < start) {
    candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, step);
  }

  let installmentsElapsed = 0;
  while (candidate.getTime() <= asOf.getTime()) {
    installmentsElapsed++;
    candidate = shiftMonths(candidate.getFullYear(), candidate.getMonth(), day, step);
  }

  const nextInstallmentDate = candidate.toISOString().slice(0, 10);
  const totalInvested = initial + installmentsElapsed * sipAmount;
  return { totalInvested, installmentsElapsed, nextInstallmentDate };
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
  asset: Pick<Asset, 'startDate' | 'sipAmount' | 'sipFrequency' | 'sipDay' | 'investedValue'>,
  asOf: Date = new Date()
): SipInstallmentPoint[] {
  const { startDate, sipAmount, sipFrequency = 'monthly', sipDay, investedValue } = asset;
  if (!startDate || !sipAmount || sipAmount <= 0) return [];

  const points: SipInstallmentPoint[] = [];
  if (investedValue && investedValue > 0) {
    points.push({ date: startDate, amount: investedValue });
  }

  const start = new Date(startDate);
  const day = sipDay && sipDay >= 1 && sipDay <= 31 ? sipDay : start.getDate();
  const step = sipFrequency === 'quarterly' ? 3 : 1;

  let candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, 0);
  if (candidate < start) {
    candidate = shiftMonths(start.getFullYear(), start.getMonth(), day, step);
  }

  while (candidate.getTime() <= asOf.getTime()) {
    points.push({ date: candidate.toISOString().slice(0, 10), amount: sipAmount });
    candidate = shiftMonths(candidate.getFullYear(), candidate.getMonth(), day, step);
  }

  return points;
}
