export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD', 'JPY'] as const;

export interface FormatCurrencyOptions {
  /** Decimal places to show. Defaults to 0 for whole amounts, use 2 for invested/price. */
  fractionDigits?: number;
}

export function formatCurrency(
  value: number,
  currency: string = 'INR',
  options?: FormatCurrencyOptions
) {
  const fractionDigits = options?.fractionDigits ?? 0;
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: false,
    })}`;
  }
}

/** Invested amounts, avg cost, and live prices — always show paise/cents. */
export function formatPreciseCurrency(value: number, currency: string = 'INR') {
  return formatCurrency(value, currency, { fractionDigits: 2 });
}

export function formatCompact(value: number, currency: string = 'INR') {
  const formatted = formatCurrency(value, currency);
  return formatted;
}

/**
 * Renders a currency amount honoring privacy mode — but only masks it when
 * there's actually something to hide. A zero/empty amount always shows as
 * "0" (formatted in the right currency) rather than a row of dots, since
 * there's nothing sensitive to protect there.
 */
export function maskAmount(
  value: number,
  currency: string = 'INR',
  privacyMode: boolean,
  options?: FormatCurrencyOptions
) {
  if (privacyMode && value !== 0) {
    return '••••••';
  }
  return formatCurrency(value, currency, options);
}

export function maskPreciseAmount(value: number, currency: string = 'INR', privacyMode: boolean) {
  return maskAmount(value, currency, privacyMode, { fractionDigits: 2 });
}

// Asset-class labels/colors now live in ./taxonomy.ts (full 39-type taxonomy).
// Re-exported here so existing imports from '../utils/currency' keep working.
export { ASSET_CLASS_LABELS, ASSET_CLASS_COLORS } from './taxonomy';
