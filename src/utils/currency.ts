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
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
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

// Asset-class labels/colors now live in ./taxonomy.ts (full 39-type taxonomy).
// Re-exported here so existing imports from '../utils/currency' keep working.
export { ASSET_CLASS_LABELS, ASSET_CLASS_COLORS } from './taxonomy';
