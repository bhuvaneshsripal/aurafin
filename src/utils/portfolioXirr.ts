/**
 * Portfolio XIRR for the Overview page — one annualised, money-weighted return for every
 * investment, built from the real dated cash flows rather than from totals:
 *
 *   money in   (negative) — each buy lot, each SIP installment / top-up, each RD installment,
 *                           each PPF deposit, a property's purchase cost and improvements …
 *   money back (positive) — each sale (net of fees), and today's value of what is still held.
 *
 * Fully-sold holdings are included, so the figure is the return on every rupee ever invested,
 * not just on what is still held. Cash & Savings is left out (no return to measure).
 *
 * Accuracy rule: a holding is only counted if EVERY one of its flows can be placed on a real
 * date and the flows add up to the cost the app already shows for it. Anything else (a legacy
 * holding with no purchase date, a deposit with no start date, an asset saved with only a current
 * value) is left out and listed, instead of being guessed at — a guessed date gives a confident
 * but wrong percentage. The solver itself lives in ./xirr.
 */
import type { Asset } from '../types';
import type { SipLiveEntry } from '../store/livePricesStore';
import { type HoldingPnl, type PortfolioPnl } from './investmentPnl';
import { listDepositInstallments, listSipInstallments, resolveAssetValues } from './assetValues';
import { propertyCost, ownershipShare } from './property';
import { toIsoDate } from './date';
import { dayNumber, xirr, type CashFlow } from './xirr';

/** Below this, annualising turns a normal move into a huge, meaningless percentage. */
export const MIN_XIRR_DAYS = 30;

export type XirrUnavailable = 'no-history' | 'too-short' | 'no-solution';

export interface PortfolioXirr {
  /** Annualised return as a percentage (12.3 = 12.3% a year), or null when unavailable. */
  percent: number | null;
  reason?: XirrUnavailable;
  /** Holdings that went into the figure / that were left out for lack of dated history. */
  included: number;
  excluded: number;
  excludedNames: string[];
  /** ISO date of the earliest flow used. */
  since?: string;
}

const EPS = 0.0001;

/** Amounts within a rupee of each other count as the same (rounding in stored prices). */
const closeEnough = (a: number, b: number) => Math.abs(a - b) <= 1 + 1e-6 * Math.max(Math.abs(a), Math.abs(b));

const validPast = (iso: string | undefined, todayIso: string): iso is string =>
  !!iso && Number.isFinite(dayNumber(iso)) && iso <= todayIso;

/**
 * Dated cash flows for one holding, or null when they can't be established reliably.
 * `invested` is what the rest of the app records as the holding's cost (null = none recorded).
 */
function holdingFlows(
  h: HoldingPnl,
  invested: number | undefined,
  todayIso: string,
  today: Date
): CashFlow[] | null {
  const asset: Asset = h.asset;
  const flows: CashFlow[] = [];
  const terminal = h.currentValue > EPS ? [{ date: today, amount: h.currentValue }] : [];

  // ---- Stocks, ETFs, funds, crypto, gold: every buy and every sale, on its own date. --------
  if (h.kind === 'lot') {
    if (h.buyLots.length === 0) return null;
    for (const lot of h.buyLots) {
      if (!validPast(lot.date, todayIso)) return null;
      flows.push({ date: lot.date, amount: -lot.amount });
    }
    for (const sale of h.sales) {
      if (!validPast(sale.date, todayIso)) return null;
      flows.push({ date: sale.date, amount: sale.saleValue });
    }
    return [...flows, ...(h.remainingQty > EPS ? terminal : [])];
  }

  // ---- Everything below is a "generic" holding: no buy / sell lots. --------------------------

  // Mutual-fund SIPs (and stock SIPs flagged as SIP class): each installment is its own flow.
  if (asset.assetClass === 'sip') {
    const items = listSipInstallments(asset);
    return fromSchedule(items, invested, terminal, todayIso);
  }

  // Recurring deposits: each monthly installment accrues from its own date.
  if (asset.assetClass === 'recurring_deposit' && asset.monthlyInstallment) {
    const items = listDepositInstallments(asset);
    return fromSchedule(items, invested, terminal, todayIso);
  }

  // PPF: the deposit ledger, starting from the passbook balance if one was entered.
  if (asset.assetClass === 'ppf' && asset.ppf && (asset.ppf.deposits?.length || asset.ppf.checkpointBalance)) {
    const p = asset.ppf;
    const items: { date: string; amount: number }[] = [];
    if (p.checkpointBalance && p.checkpointBalance > 0 && p.checkpointFy) {
      // The balance is as at 31 March of that year; treat it as money put in on that day.
      items.push({ date: `${p.checkpointFy}-03-31`, amount: p.checkpointBalance });
    } else if (p.checkpointBalance && p.checkpointBalance > 0) {
      return null;
    }
    for (const d of p.deposits ?? []) if (d.amount > 0) items.push({ date: d.date, amount: d.amount });
    if (items.length === 0) return null;
    for (const it of items) {
      if (!validPast(it.date, todayIso)) return null;
      flows.push({ date: it.date, amount: -it.amount });
    }
    return [...flows, ...terminal];
  }

  // Residential property: purchase cost on the purchase date, each improvement on its own date.
  if (asset.assetClass === 'residential_property' && asset.property?.purchaseDate) {
    const d = asset.property;
    const share = ownershipShare(d);
    const cost = propertyCost(d);
    if (!(cost.acquisition > 0) || !validPast(d.purchaseDate, todayIso)) return null;
    flows.push({ date: d.purchaseDate!, amount: -cost.acquisition * share });
    for (const imp of d.improvements ?? []) {
      if (!(imp.amount > 0)) continue;
      if (!validPast(imp.date, todayIso)) return null;
      flows.push({ date: imp.date, amount: -imp.amount * share });
    }
    return [...flows, ...terminal];
  }

  // Fixed deposits, bonds, EPF, anything else with one recorded cost and one start date.
  if (!invested || invested <= 0) return null; // saved with a value only: no cost to measure against
  if (!validPast(asset.startDate, todayIso)) return null;
  return [{ date: asset.startDate!, amount: -invested }, ...terminal];
}

/** Flows from a list of dated installments, accepted only if they add up to the recorded cost. */
function fromSchedule(
  items: { date: string; amount: number }[],
  invested: number | undefined,
  terminal: CashFlow[],
  todayIso: string
): CashFlow[] | null {
  if (items.length === 0) return null;
  let total = 0;
  const flows: CashFlow[] = [];
  for (const it of items) {
    if (!validPast(it.date, todayIso)) return null;
    total += it.amount;
    flows.push({ date: it.date, amount: -it.amount });
  }
  // If the dated schedule doesn't reproduce the cost shown on Overview, something is undated.
  if (invested === undefined || !closeEnough(total, invested)) return null;
  return [...flows, ...terminal];
}

/**
 * The portfolio's XIRR. Pass the same `PortfolioPnl` the Overview already built (it must be built
 * from all of the profile's assets, sold ones included) so the holdings agree with every other
 * number on the page.
 */
export function computePortfolioXirr(
  pnl: PortfolioPnl,
  livePrices: Record<string, number>,
  sipValues: Record<string, SipLiveEntry>,
  goldPricePerGram: number | null,
  today: Date = new Date()
): PortfolioXirr {
  const todayIso = toIsoDate(today);
  const all: CashFlow[] = [];
  let included = 0;
  const excludedNames: string[] = [];

  for (const h of pnl.holdings) {
    const resolved = resolveAssetValues(h.asset, livePrices, sipValues, goldPricePerGram);
    const flows = holdingFlows(h, resolved.invested, todayIso, today);
    if (flows === null) {
      excludedNames.push(h.asset.name);
      continue;
    }
    included++;
    all.push(...flows);
  }

  const base = { included, excluded: excludedNames.length, excludedNames };
  if (all.length === 0) return { ...base, percent: null, reason: 'no-history' };

  const first = all.reduce((min, f) => (dayNumber(f.date) < dayNumber(min.date) ? f : min)).date;
  const firstIso = typeof first === 'string' ? first : toIsoDate(first);
  if (dayNumber(today) - dayNumber(first) < MIN_XIRR_DAYS) {
    return { ...base, percent: null, reason: 'too-short', since: firstIso };
  }

  const rate = xirr(all);
  if (rate === null) return { ...base, percent: null, reason: 'no-solution', since: firstIso };
  return { ...base, percent: rate * 100, since: firstIso };
}
