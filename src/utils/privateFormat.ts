import { useUiStore } from '../store/uiStore';
import * as base from './currency';

/**
 * Privacy-aware drop-ins for the formatters in ./currency. Same names and
 * signatures — portfolio screens import from here instead, so when the eye
 * in the top bar is closed every amount, price, return and percentage is
 * replaced by dots without each call site having to remember to check.
 *
 * Zero amounts are left alone (nothing to hide). Screens that show numbers
 * the person typed into a calculator, exports and the PDF report keep using
 * ./currency directly.
 *
 * The flag is mirrored from the store synchronously (this subscription is
 * registered before any component subscribes), and AppShell re-renders the
 * whole page tree when the eye toggles, so the new text appears at once.
 */
let hidden = useUiStore.getState().privacyMode;
useUiStore.subscribe((s) => {
  hidden = s.privacyMode;
});

export const DOTS = '••••••';
const PCT_DOTS = '•••';

export function formatCurrency(value: number, currency: string = 'INR', options?: base.FormatCurrencyOptions) {
  if (hidden && !base.isZeroAmount(value, options?.fractionDigits ?? 0)) return DOTS;
  return base.formatCurrency(value, currency, options);
}

export function formatPreciseCurrency(value: number, currency: string = 'INR') {
  return formatCurrency(value, currency, { fractionDigits: 2 });
}

export function formatCompact(value: number, currency: string = 'INR') {
  return formatCurrency(value, currency);
}

export function formatSignedCurrency(amount: number, currency: string = 'INR', fractionDigits: number = 2) {
  if (hidden && !base.isZeroAmount(amount, fractionDigits)) return DOTS;
  return base.formatSignedCurrency(amount, currency, fractionDigits);
}

export function formatPercentMagnitude(percent: number, fractionDigits: number = 2) {
  return hidden ? PCT_DOTS : base.formatPercentMagnitude(percent, fractionDigits);
}

/** Axis ticks have no room for dots — hide them entirely. */
export function formatAxisAmount(value: number, currency: string = 'INR') {
  return hidden ? '' : base.formatAxisAmount(value, currency);
}

/** A plain number (quantity, ratio, percent string…) — dots while hidden. */
export function hideNumber<T extends string | number>(value: T): T | string {
  return hidden ? PCT_DOTS : value;
}
