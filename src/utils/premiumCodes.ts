/**
 * PREMIUM / DISCOUNT CODES — IMPORTANT CAVEATS
 * =============================================
 * This app has no payment backend, so these codes are enforced entirely in
 * the browser. That means:
 *  - Anyone who opens dev tools can read this file in the shipped JS bundle
 *    and see exactly how codes are generated/checked, including the
 *    developer master code below.
 *  - There's no way to stop a code from being reused by many people, or to
 *    revoke one, without a real backend (e.g. a Vercel API route + a small
 *    database of redeemed codes).
 *  - Nothing here actually collects money. It only unlocks/marks state in
 *    each person's own Firestore account. Payment still has to happen
 *    out-of-band (UPI, bank transfer, etc.) and you manually confirm it —
 *    or you wire up a real payment gateway (see the note in Settings > Billing).
 *
 * Treat this as a "friends and family" convenience layer, not real
 * anti-piracy protection. If you outgrow that, move validation into an
 * API route under /api so the secret never ships to the browser.
 */

// CHANGE THESE before sharing the app with anyone — keep the values
// private (don't post them publicly). Give a person the code matching
// what they actually paid for, once you've confirmed the UPI payment.
export const DEV_MASTER_CODE = 'AURAFIN-DEV-2026';

/** Plan-specific unlock codes. Each grants Premium for a fixed duration
 *  from the moment it's redeemed — Monthly and Quarterly actually expire,
 *  only Lifetime (and the developer master code) don't. */
export const PLAN_CODES: Record<'monthly' | 'quarterly' | 'lifetime', { code: string; durationDays: number | null }> = {
  monthly: { code: 'AURAFIN-1M-2026', durationDays: 30 },
  quarterly: { code: 'AURAFIN-3M-2026', durationDays: 90 },
  lifetime: { code: 'AURAFIN-LIFE-2026', durationDays: null },
};

const DISCOUNT_PREFIX = 'AURA15-';

/** Flat 20%-off promo code — same for everyone (not tied to a UID like the
 *  AURA15-XXXXXX codes). Unlike those, this one actually reduces the price
 *  shown/paid, and is auto-applied as soon as it's typed correctly. */
export const PROMO20_CODE = 'AURA20';
export const PROMO20_PCT = 20;

/** ₹1-only special — same idea as PROMO20 but only ever discounts the
 *  Monthly plan down to a flat ₹1. Auto-applied live as soon as it's typed
 *  correctly, same as AURA20. */
export const PROMO1RS_CODE = 'AURA1RS';
export const PROMO1RS_PRICE = 1;

/** Deterministically derives a shareable 15%-discount code from a user's
 *  Firebase UID, so no server-side storage is needed to generate or check
 *  one. Same UID always produces the same code. */
export function generateDiscountCode(uid: string): string {
  let hash = 0;
  for (let i = 0; i < uid.length; i++) {
    hash = (hash * 31 + uid.charCodeAt(i)) >>> 0;
  }
  const suffix = hash.toString(36).toUpperCase().slice(0, 6).padStart(6, '0');
  return `${DISCOUNT_PREFIX}${suffix}`;
}

export type CodeCheckResult =
  | { kind: 'developer' }
  | { kind: 'plan'; planId: 'monthly' | 'quarterly' | 'lifetime'; durationDays: number | null }
  | { kind: 'discount'; code: string }
  | { kind: 'promo20' }
  | { kind: 'promo1rs' }
  | { kind: 'invalid' };

/** Checks a code the person typed in. Doesn't check WHO owns a discount
 *  code — any correctly-formatted AURA15-XXXXXX code is accepted, since
 *  there's no backend to look up the real owner. */
export function checkRedeemCode(input: string): CodeCheckResult {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return { kind: 'invalid' };
  if (trimmed === DEV_MASTER_CODE.toUpperCase()) return { kind: 'developer' };
  if (trimmed === PROMO20_CODE.toUpperCase()) return { kind: 'promo20' };
  if (trimmed === PROMO1RS_CODE.toUpperCase()) return { kind: 'promo1rs' };
  for (const [planId, { code, durationDays }] of Object.entries(PLAN_CODES) as [
    'monthly' | 'quarterly' | 'lifetime',
    { code: string; durationDays: number | null },
  ][]) {
    if (trimmed === code.toUpperCase()) return { kind: 'plan', planId, durationDays };
  }
  if (/^AURA15-[A-Z0-9]{6}$/.test(trimmed)) return { kind: 'discount', code: trimmed };
  return { kind: 'invalid' };
}

/** True the moment the person's typed input exactly matches the AURA20
 *  promo code (case-insensitive), so the UI can auto-apply it live as they
 *  type rather than waiting for a button press. */
export function isPromo20Code(input: string): boolean {
  return input.trim().toUpperCase() === PROMO20_CODE.toUpperCase();
}

/** True the moment the person's typed input exactly matches the AURA1RS
 *  ₹1-only promo code (case-insensitive). */
export function isPromo1RsCode(input: string): boolean {
  return input.trim().toUpperCase() === PROMO1RS_CODE.toUpperCase();
}
