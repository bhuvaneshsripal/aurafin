/** IPO / Pre-IPO lifecycle maths. Pure functions, shared by the form, cards and Analytics. */
import type { IpoDetails, IpoStage } from '../types';

export const RETAIL_APPLICATION_LIMIT = 200000;

export const IPO_STAGES: { key: IpoStage; label: string; hint: string }[] = [
  { key: 'applied', label: 'Applied', hint: 'Bid placed, awaiting allotment' },
  { key: 'allotted', label: 'Allotted', hint: 'Shares allotted, not listed yet' },
  { key: 'listed', label: 'Listed', hint: 'Trading on the exchange' },
  { key: 'not_allotted', label: 'Not allotted', hint: 'Money unblocked' },
  { key: 'pre_ipo', label: 'Pre-IPO', hint: 'Unlisted shares you hold' },
];

export const IPO_CATEGORIES = [
  { value: 'retail', label: 'Retail (RII)' },
  { value: 'shni', label: 'Small HNI (₹2-10L)' },
  { value: 'bhni', label: 'Big HNI (₹10L+)' },
  { value: 'employee', label: 'Employee' },
  { value: 'shareholder', label: 'Shareholder' },
] as const;

export interface IpoComputed {
  /** Money ASBA blocks on the cut-off price: lots x lot size x upper band. */
  applicationAmount: number | undefined;
  appliedShares: number | undefined;
  /** Retail bids above 2 lakh are not allowed. */
  overRetailLimit: boolean;
  maxRetailLots: number | undefined;
  /** Rupees actually invested (shares x issue price). */
  invested: number;
  quantity: number;
  avgCost: number | undefined;
  /** Price used to value the position. */
  price: number | undefined;
  priceSource: 'current' | 'listing' | 'issue' | 'none';
  currentValue: number;
  /** Listing-day gain on allotted shares, once a listing price is known. */
  listingGain: number | undefined;
  listingGainPct: number | undefined;
  /** Unrealised gain vs. issue price at the valuing price. */
  gain: number | undefined;
  gainPct: number | undefined;
  /** Expected listing price from the issue/upper-band price + GMP. */
  gmpListingPrice: number | undefined;
  gmpGainPct: number | undefined;
  /** GMP profit on one lot, and on everything applied for (if fully allotted). */
  gmpPerLot: number | undefined;
  gmpOnApplied: number | undefined;
  /** Money returned after allotment (blocked minus invested). */
  refund: number | undefined;
  /** Money currently blocked while the bid is pending. */
  blocked: number;
}

const pos = (n: number | undefined): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function computeIpo(d: IpoDetails): IpoComputed {
  const high = d.priceBandHigh;
  const lots = d.lotsApplied;
  const appliedShares = pos(d.lotSize) && pos(lots) ? d.lotSize * lots : undefined;
  const applicationAmount = appliedShares !== undefined && pos(high) ? appliedShares * high : undefined;
  const maxRetailLots = pos(d.lotSize) && pos(high) ? Math.floor(RETAIL_APPLICATION_LIMIT / (d.lotSize * high)) : undefined;
  const overRetailLimit = (d.category ?? 'retail') === 'retail' && applicationAmount !== undefined && applicationAmount > RETAIL_APPLICATION_LIMIT;

  const holds = d.stage === 'allotted' || d.stage === 'listed' || d.stage === 'pre_ipo';
  const quantity = holds && pos(d.sharesAllotted) ? d.sharesAllotted : 0;
  const issue = d.issuePrice ?? (d.stage === 'applied' ? high : undefined);
  const invested = quantity > 0 && pos(d.issuePrice) ? quantity * d.issuePrice : 0;

  let price: number | undefined;
  let priceSource: IpoComputed['priceSource'] = 'none';
  if (quantity > 0) {
    if (pos(d.currentPrice)) {
      price = d.currentPrice;
      priceSource = 'current';
    } else if (d.stage === 'listed' && pos(d.listingPrice)) {
      price = d.listingPrice;
      priceSource = 'listing';
    } else if (pos(d.issuePrice)) {
      price = d.issuePrice;
      priceSource = 'issue';
    }
  }
  const currentValue = price !== undefined ? quantity * price : 0;
  const gain = price !== undefined && invested > 0 ? currentValue - invested : undefined;
  const gainPct = gain !== undefined && invested > 0 ? (gain / invested) * 100 : undefined;

  const listingGain = d.stage !== 'pre_ipo' && quantity > 0 && pos(d.listingPrice) && pos(d.issuePrice) ? quantity * (d.listingPrice - d.issuePrice) : undefined;
  const listingGainPct = pos(d.listingPrice) && pos(d.issuePrice) ? ((d.listingPrice - d.issuePrice) / d.issuePrice) * 100 : undefined;

  const gmpBase = issue;
  const hasGmp = typeof d.gmp === 'number' && Number.isFinite(d.gmp) && pos(gmpBase);
  const gmpListingPrice = hasGmp ? gmpBase + (d.gmp as number) : undefined;
  const gmpGainPct = hasGmp ? ((d.gmp as number) / gmpBase) * 100 : undefined;
  const gmpPerLot = hasGmp && pos(d.lotSize) ? (d.gmp as number) * d.lotSize : undefined;
  const gmpOnApplied = hasGmp && appliedShares !== undefined ? (d.gmp as number) * appliedShares : undefined;

  const refund = d.stage === 'allotted' || d.stage === 'listed' ? (applicationAmount !== undefined && invested > 0 ? Math.max(0, applicationAmount - invested) : undefined) : d.stage === 'not_allotted' ? applicationAmount : undefined;
  const blocked = d.stage === 'applied' && applicationAmount !== undefined ? applicationAmount : 0;

  return {
    applicationAmount, appliedShares, overRetailLimit, maxRetailLots, invested, quantity,
    avgCost: quantity > 0 && pos(d.issuePrice) ? d.issuePrice : undefined,
    price, priceSource, currentValue, listingGain, listingGainPct, gain, gainPct,
    gmpListingPrice, gmpGainPct, gmpPerLot, gmpOnApplied, refund, blocked,
  };
}

/** Allotment probability for a retail bid, from oversubscription: ~1/x lots lottery when x > 1. */
export function retailAllotmentChance(subscriptionTimes: number | undefined, lotsAllottedPerWinner = 1): number | undefined {
  if (!pos(subscriptionTimes)) return undefined;
  if (subscriptionTimes <= 1) return 1;
  return Math.min(1, 1 / subscriptionTimes / lotsAllottedPerWinner);
}
