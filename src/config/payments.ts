/**
 * PAYMENT CONFIG — edit before going live
 * =========================================
 * Fill in your real UPI ID below. Everything here ships to the browser
 * (it's a static frontend), so don't put anything more sensitive than a
 * UPI ID / display name in this file.
 *
 * This does NOT verify payments automatically — there's no backend for
 * that. A person taps "Pay via UPI" (or scans the QR on desktop), pays you
 * directly, and you manually confirm and hand them a redeem code from
 * Settings → Billing on your own account. See premiumCodes.ts for the
 * code-generation side of that flow.
 */

// TODO: replace with your real UPI ID (e.g. "yourname@okhdfcbank")
export const UPI_ID = '';

// TODO: replace with your name/business name as it should show in the UPI app
export const PAYEE_NAME = 'Aurafin';

export interface PricingPlan {
  id: 'monthly' | 'quarterly' | 'lifetime';
  label: string;
  price: number;
  /** Short note shown under the price. */
  blurb: string;
}

export const PRICING_PLANS: PricingPlan[] = [
  { id: 'monthly', label: '1 Month', price: 49, blurb: 'Billed monthly' },
  { id: 'quarterly', label: '3 Months', price: 99, blurb: 'Save vs monthly' },
  { id: 'lifetime', label: 'Lifetime', price: 399, blurb: 'Pay once, own it forever' },
];

export const PLAN_LABELS: Record<PricingPlan['id'], string> = {
  monthly: '1 Month',
  quarterly: '3 Months',
  lifetime: 'Lifetime',
};

/** Builds a standard UPI deep link. Opens the person's UPI app directly on
 *  mobile with the amount pre-filled; on desktop it's best shown as a QR
 *  code to scan instead (see UpiQrCode component). */
export function buildUpiLink(plan: PricingPlan): string {
  const params = new URLSearchParams({
    pa: UPI_ID,
    pn: PAYEE_NAME,
    am: plan.price.toFixed(2),
    cu: 'INR',
    tn: `Aurafin ${plan.label} Premium`,
  });
  return `upi://pay?${params.toString()}`;
}
