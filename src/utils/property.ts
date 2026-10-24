import type { Asset, Liability, PropertyDetails } from '../types';
import { fyOfIso } from './ppf';
import { toIsoDate } from './date';

/**
 * Residential property maths: cost basis, appreciation, rental yield, loan equity, a
 * "what if I sold today" capital-gains estimate and a simple projection.
 *
 * Conventions
 *  - Price, rent and running costs are entered for the WHOLE property. `ownershipPct` is applied
 *    to get the person's share; the asset's own `value` / `investedValue` are always that share.
 *  - Everything is an estimate to help decisions, never tax advice or a valuation.
 *
 * Capital-gains rules used (India, resident individual):
 *  - Held for more than 24 months => long term, otherwise short term (taxed at the person's slab).
 *  - Long-term gain on property sold on/after 23 Jul 2024: 12.5% without indexation. For property
 *    bought BEFORE 23 Jul 2024 the person may instead pay 20% with indexation, and the lower of
 *    the two is taken here.
 *  - 4% health & education cess is added. Surcharge, Section 54 / 54EC exemptions and the
 *    taxability of gains on property held in a different structure (company, trust) are NOT
 *    modelled.
 */

export const PROPERTY_LONG_TERM_MONTHS = 24;
/** Property acquired before this date keeps the option of 20% with indexation. */
export const INDEXATION_CUTOFF = '2024-07-23';
export const LTCG_RATE_NO_INDEXATION = 12.5;
export const LTCG_RATE_INDEXED = 20;
const CESS = 1.04;
/** Costs (property tax, maintenance…) are assumed to rise this much a year in the projection. */
export const COST_INFLATION_PCT = 5;
export const DEFAULT_GROWTH_PCT = 6;
export const DEFAULT_RENT_ESCALATION_PCT = 5;
export const DEFAULT_SELLING_COST_PCT = 2;

/** Cost Inflation Index by financial year, keyed by the calendar year the FY starts in. */
const CII: Record<number, number> = {
  2001: 100, 2002: 105, 2003: 109, 2004: 113, 2005: 117, 2006: 122, 2007: 129, 2008: 137, 2009: 148,
  2010: 167, 2011: 184, 2012: 200, 2013: 220, 2014: 240, 2015: 254, 2016: 264, 2017: 272, 2018: 280,
  2019: 289, 2020: 301, 2021: 317, 2022: 331, 2023: 348, 2024: 363, 2025: 376, 2026: 384,
};
const LATEST_CII_FY = 2026;
/** CII for the FY starting in `fyStart`. Years before 2001 use the 2001-02 base; years after the latest notified one reuse it. */
export const ciiFor = (fyStart: number) => (fyStart < 2001 ? CII[2001] : (CII[fyStart] ?? CII[LATEST_CII_FY]));

/** A real calendar date in yyyy-mm-dd form (rejects things like 2026-02-31). */
const isoOk = (v?: string): v is string => {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const y = +v.slice(0, 4);
  const m = +v.slice(5, 7);
  const d = +v.slice(8, 10);
  return m >= 1 && m <= 12 && d >= 1 && d <= new Date(y, m, 0).getDate();
};
const pos = (n?: number) => (n !== undefined && Number.isFinite(n) && n > 0 ? n : 0);

/** Whole months from `fromIso` to `toIso` (a partial month doesn't count). */
export function monthsBetween(fromIso: string, toIsoStr: string): number {
  const y = +toIsoStr.slice(0, 4) - +fromIso.slice(0, 4);
  const m = +toIsoStr.slice(5, 7) - +fromIso.slice(5, 7);
  const d = +toIsoStr.slice(8, 10) - +fromIso.slice(8, 10);
  return y * 12 + m - (d < 0 ? 1 : 0);
}

const daysBetween = (fromIso: string, toIsoStr: string) =>
  Math.round(
    (Date.UTC(+toIsoStr.slice(0, 4), +toIsoStr.slice(5, 7) - 1, +toIsoStr.slice(8, 10)) -
      Date.UTC(+fromIso.slice(0, 4), +fromIso.slice(5, 7) - 1, +fromIso.slice(8, 10))) /
      86400000
  );

/** The person's share of the property, 0–1 (defaults to the whole property). */
export function ownershipShare(d?: PropertyDetails): number {
  const p = d?.ownershipPct;
  if (p === undefined || !Number.isFinite(p) || p <= 0) return 1;
  return Math.min(100, p) / 100;
}

/* ------------------------------------------------------------------------------------------ */
/* Cost basis                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface PropertyCost {
  price: number;
  /** Stamp duty + registration + brokerage + other one-off purchase costs. */
  closing: number;
  /** Price + closing costs. */
  acquisition: number;
  improvements: number;
  /** Whole-property cost: acquisition + improvements. */
  total: number;
  /** The person's share of `total`. */
  yourTotal: number;
}

export function propertyCost(d?: PropertyDetails): PropertyCost {
  const price = pos(d?.purchasePrice);
  const closing = pos(d?.stampDuty) + pos(d?.registrationFee) + pos(d?.brokerage) + pos(d?.otherPurchaseCosts);
  const improvements = (d?.improvements ?? []).reduce((s, i) => s + pos(i.amount), 0);
  const acquisition = price + closing;
  const total = acquisition + improvements;
  return { price, closing, acquisition, improvements, total, yourTotal: total * ownershipShare(d) };
}

/* ------------------------------------------------------------------------------------------ */
/* Valuation & appreciation                                                                    */
/* ------------------------------------------------------------------------------------------ */

/** Person's share of area × current rate per sq ft, or undefined when either is missing. */
export function rateBasedValue(d?: PropertyDetails): number | undefined {
  const area = pos(d?.areaSqft);
  const rate = pos(d?.ratePerSqft);
  return area > 0 && rate > 0 ? Math.round(area * rate * ownershipShare(d)) : undefined;
}

/** Value of the whole property, given the person's share of it. */
export const wholePropertyValue = (d: PropertyDetails | undefined, yourValue: number) => yourValue / ownershipShare(d);

export interface Appreciation {
  /** Value − cost, for the person's share. */
  gain: number;
  gainPct: number;
  years?: number;
  /** Compound annual growth of value over cost since purchase (approximate when improvements were made later). */
  cagr?: number;
  /** Price paid per sq ft (excluding closing costs). */
  boughtPerSqft?: number;
  /** Today's whole-property value per sq ft. */
  nowPerSqft?: number;
}

export function propertyAppreciation(d: PropertyDetails | undefined, yourValue: number, today = toIsoDate()): Appreciation | null {
  const cost = propertyCost(d);
  if (!(cost.yourTotal > 0) || !(yourValue > 0)) return null;
  const gain = yourValue - cost.yourTotal;
  const days = isoOk(d?.purchaseDate) ? daysBetween(d!.purchaseDate!, today) : undefined;
  const years = days !== undefined && days > 0 ? days / 365.25 : undefined;
  const area = pos(d?.areaSqft);
  return {
    gain,
    gainPct: (gain / cost.yourTotal) * 100,
    years,
    // Under ~3 months a compounded figure is meaningless.
    cagr: years !== undefined && years >= 0.25 ? (Math.pow(yourValue / cost.yourTotal, 1 / years) - 1) * 100 : undefined,
    boughtPerSqft: area > 0 && cost.price > 0 ? cost.price / area : undefined,
    nowPerSqft: area > 0 ? wholePropertyValue(d, yourValue) / area : undefined,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Rent & running costs                                                                        */
/* ------------------------------------------------------------------------------------------ */

export interface RentalAnalysis {
  earnsRent: boolean;
  /** Whole-property rent actually expected in a year, after vacancy. */
  annualRent: number;
  /** Whole-property running costs per year. */
  annualCosts: number;
  /** Whole-property net operating income per year (can be negative). */
  netAnnual: number;
  /** The person's share of the net income, per month. */
  yourNetMonthly: number;
  grossYieldPct?: number;
  netYieldPct?: number;
  /** Net income ÷ what was paid in all. */
  yieldOnCostPct?: number;
  leaseDaysLeft?: number;
  hasAnyFigures: boolean;
}

export function rentalAnalysis(d: PropertyDetails | undefined, yourValue: number, today = toIsoDate()): RentalAnalysis {
  const earnsRent = d?.usage === 'rented';
  const rent = pos(d?.monthlyRent);
  const vacancy = Math.min(12, pos(d?.vacancyMonths));
  const annualRent = earnsRent ? rent * (12 - vacancy) : 0;
  const annualCosts = pos(d?.propertyTaxYearly) + pos(d?.maintenanceMonthly) * 12 + pos(d?.insuranceYearly) + pos(d?.otherCostsYearly);
  const netAnnual = annualRent - annualCosts;
  const whole = yourValue > 0 ? wholePropertyValue(d, yourValue) : 0;
  const cost = propertyCost(d);
  return {
    earnsRent,
    annualRent,
    annualCosts,
    netAnnual,
    yourNetMonthly: (netAnnual * ownershipShare(d)) / 12,
    grossYieldPct: earnsRent && rent > 0 && whole > 0 ? ((rent * 12) / whole) * 100 : undefined,
    netYieldPct: (annualRent > 0 || annualCosts > 0) && whole > 0 ? (netAnnual / whole) * 100 : undefined,
    yieldOnCostPct: (annualRent > 0 || annualCosts > 0) && cost.total > 0 ? (netAnnual / cost.total) * 100 : undefined,
    leaseDaysLeft: earnsRent && isoOk(d?.leaseEnd) ? daysBetween(today, d!.leaseEnd!) : undefined,
    hasAnyFigures: annualRent > 0 || annualCosts > 0,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Loan & equity                                                                               */
/* ------------------------------------------------------------------------------------------ */

export interface LoanAnalysis {
  outstanding: number;
  emi?: number;
  ratePct?: number;
  /** Value − outstanding loan (the person's share of value). */
  equity: number;
  /** Outstanding ÷ value, %. */
  ltvPct?: number;
  interestThisMonth?: number;
  principalThisMonth?: number;
  /** Months until the loan is cleared at the current EMI and rate. */
  monthsLeft?: number;
}

export function loanAnalysis(loan: Liability | undefined, yourValue: number): LoanAnalysis | null {
  if (!loan) return null;
  const outstanding = pos(loan.outstanding);
  const emi = pos(loan.emi) || undefined;
  const ratePct = loan.interestRate !== undefined && loan.interestRate >= 0 ? loan.interestRate : undefined;
  const i = ratePct !== undefined ? ratePct / 1200 : undefined;
  const interestThisMonth = i !== undefined ? outstanding * i : undefined;
  let monthsLeft: number | undefined;
  if (emi && outstanding > 0) {
    if (i === undefined) monthsLeft = undefined;
    else if (i === 0) monthsLeft = Math.ceil(outstanding / emi);
    else if (emi > outstanding * i) monthsLeft = Math.ceil(Math.log(emi / (emi - outstanding * i)) / Math.log(1 + i));
  }
  return {
    outstanding,
    emi,
    ratePct,
    equity: yourValue - outstanding,
    ltvPct: yourValue > 0 ? (outstanding / yourValue) * 100 : undefined,
    interestThisMonth,
    principalThisMonth: emi !== undefined && interestThisMonth !== undefined ? emi - interestThisMonth : undefined,
    monthsLeft,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* "If I sold today"                                                                           */
/* ------------------------------------------------------------------------------------------ */

export interface SaleEstimate {
  salePrice: number;
  sellingCost: number;
  /** Sale price − selling costs. */
  netSale: number;
  /** Person's share of everything paid in (price, closing costs, improvements). */
  cost: number;
  /** Net sale − cost, before tax (negative = loss). */
  gain: number;
  holdingMonths?: number;
  longTerm?: boolean;
  /** Which tax treatment produced `tax`. */
  regime: 'ltcg_flat' | 'ltcg_indexed' | 'stcg' | 'loss' | 'unknown';
  tax?: number;
  /** Tax under each LTCG option, when long term. */
  taxFlat?: number;
  taxIndexed?: number;
  indexedCost?: number;
  indexationAllowed?: boolean;
  /** Net sale − tax (undefined when the tax can't be worked out yet). */
  afterTax?: number;
  /** After tax and after clearing `loanOutstanding`. */
  inHand?: number;
}

export function estimateSale(
  d: PropertyDetails | undefined,
  yourValue: number,
  loanOutstanding = 0,
  today = toIsoDate()
): SaleEstimate | null {
  if (!(yourValue > 0)) return null;
  const share = ownershipShare(d);
  const cost = propertyCost(d);
  const sellingCost = (yourValue * (d?.sellingCostPct ?? DEFAULT_SELLING_COST_PCT)) / 100;
  const netSale = yourValue - sellingCost;
  const base: SaleEstimate = { salePrice: yourValue, sellingCost, netSale, cost: cost.yourTotal, gain: netSale - cost.yourTotal, regime: 'unknown' };
  if (!(cost.yourTotal > 0) || !isoOk(d?.purchaseDate)) return base;

  const purchase = d!.purchaseDate!;
  const holdingMonths = monthsBetween(purchase, today);
  const longTerm = holdingMonths > PROPERTY_LONG_TERM_MONTHS;
  const gain = base.gain;
  const out: SaleEstimate = { ...base, holdingMonths, longTerm };

  if (gain <= 0) return { ...out, regime: 'loss', tax: 0, afterTax: netSale, inHand: netSale - loanOutstanding };

  if (!longTerm) {
    const tax = gain * ((d?.taxSlabPct ?? 30) / 100) * CESS;
    return { ...out, regime: 'stcg', tax, afterTax: netSale - tax, inHand: netSale - tax - loanOutstanding };
  }

  const taxFlat = gain * (LTCG_RATE_NO_INDEXATION / 100) * CESS;
  const indexationAllowed = purchase < INDEXATION_CUTOFF;
  let taxIndexed: number | undefined;
  let indexedCost: number | undefined;
  if (indexationAllowed) {
    const saleCii = ciiFor(fyOfIso(today));
    const acqCii = ciiFor(fyOfIso(purchase));
    const acqIndexed = cost.acquisition * (saleCii / acqCii);
    // An improvement with a usable date is indexed from its own year; one without a date is still
    // counted, just at face value, so it never silently drops out of the cost.
    const impIndexed = (d?.improvements ?? []).reduce((s, i) => {
      const amount = pos(i.amount);
      if (amount <= 0) return s;
      return s + (isoOk(i.date) ? amount * (saleCii / ciiFor(fyOfIso(i.date))) : amount);
    }, 0);
    indexedCost = (acqIndexed + impIndexed) * share;
    taxIndexed = Math.max(0, netSale - indexedCost) * (LTCG_RATE_INDEXED / 100) * CESS;
  }
  const useIndexed = taxIndexed !== undefined && taxIndexed < taxFlat;
  const tax = useIndexed ? taxIndexed! : taxFlat;
  return {
    ...out,
    regime: useIndexed ? 'ltcg_indexed' : 'ltcg_flat',
    tax,
    taxFlat,
    taxIndexed,
    indexedCost,
    indexationAllowed,
    afterTax: netSale - tax,
    inHand: netSale - tax - loanOutstanding,
  };
}

/* ------------------------------------------------------------------------------------------ */
/* Projection                                                                                  */
/* ------------------------------------------------------------------------------------------ */

export interface ProjectionRow {
  years: number;
  /** Person's share of the property value after `years`. */
  value: number;
  /** Person's share of net rent (after running costs) collected over those years. */
  cumulativeNet: number;
  total: number;
}

export function projectProperty(
  d: PropertyDetails | undefined,
  yourValue: number,
  horizons: number[] = [5, 10, 15, 20]
): { growthPct: number; rows: ProjectionRow[] } | null {
  if (!(yourValue > 0)) return null;
  const growthPct = d?.growthPct ?? DEFAULT_GROWTH_PCT;
  const escalation = d?.rentEscalationPct ?? DEFAULT_RENT_ESCALATION_PCT;
  const share = ownershipShare(d);
  const { annualRent, annualCosts } = rentalAnalysis(d, yourValue);
  const rows: ProjectionRow[] = [];
  let cumulative = 0;
  let year = 0;
  for (const h of [...horizons].sort((a, b) => a - b)) {
    for (; year < h; year++) {
      const rent = annualRent * Math.pow(1 + escalation / 100, year);
      const costs = annualCosts * Math.pow(1 + COST_INFLATION_PCT / 100, year);
      cumulative += (rent - costs) * share;
    }
    const value = yourValue * Math.pow(1 + growthPct / 100, h);
    rows.push({ years: h, value, cumulativeNet: cumulative, total: value + cumulative });
  }
  return { growthPct, rows };
}

/* ------------------------------------------------------------------------------------------ */
/* Compact summary for the asset page                                                          */
/* ------------------------------------------------------------------------------------------ */

export interface PropertySummary {
  appreciation: Appreciation | null;
  rental: RentalAnalysis;
  loan: LoanAnalysis | null;
  /** Monthly net rent after the loan EMI, when there is a linked loan with an EMI. */
  monthlyAfterEmi?: number;
}

export function summarizeProperty(asset: Asset, loans: Liability[], value = asset.value, today = toIsoDate()): PropertySummary | null {
  const d = asset.property;
  if (!d) return null;
  const linked = d.linkedLoanId ? loans.find((l) => l.id === d.linkedLoanId) : undefined;
  const rental = rentalAnalysis(d, value, today);
  const loan = loanAnalysis(linked, value);
  return {
    appreciation: propertyAppreciation(d, value, today),
    rental,
    loan,
    monthlyAfterEmi: loan?.emi !== undefined && rental.hasAnyFigures ? rental.yourNetMonthly - loan.emi : undefined,
  };
}
