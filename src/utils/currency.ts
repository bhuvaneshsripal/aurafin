export const CURRENCIES = [
  'INR',
  'USD',
  'EUR',
  'GBP',
  'SGD',
  'AED',
  'KWD',
  'SAR',
  'QAR',
  'CAD',
  'AUD',
  'JPY',
  'CHF',
  'HKD',
  'CNY',
] as const;

/** Display symbols for the currency picker (CurrencySelect) — purely
 *  cosmetic, doesn't affect formatCurrency/Intl formatting below. */
export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  SGD: 'S$',
  AED: 'د.إ',
  KWD: 'د.ك',
  SAR: 'ر.س',
  QAR: 'ر.ق',
  CAD: 'C$',
  AUD: 'A$',
  JPY: '¥',
  CHF: 'CHF',
  HKD: 'HK$',
  CNY: '¥',
};

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
      useGrouping: true,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
      useGrouping: true,
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

/** True if `value` rounds to 0 at the given display precision — guards
 *  against floating-point residue (e.g. summing/subtracting many decimals
 *  landing on 0.0000000001 instead of exactly 0) being treated as "real"
 *  money and masked when it shouldn't be. */
export function isZeroAmount(value: number, fractionDigits: number = 0) {
  const factor = 10 ** fractionDigits;
  return Math.round(value * factor) / factor === 0;
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
  if (privacyMode && !isZeroAmount(value, options?.fractionDigits ?? 0)) {
    return '••••••';
  }
  return formatCurrency(value, currency, options);
}

export function maskPreciseAmount(value: number, currency: string = 'INR', privacyMode: boolean) {
  return maskAmount(value, currency, privacyMode, { fractionDigits: 2 });
}

/** "+₹1,80.00" / "-₹118.41" — sign shown once, up front (and "+" for gains). */
export function formatSignedCurrency(amount: number, currency: string = 'INR', fractionDigits: number = 2) {
  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';
  return `${sign}${formatCurrency(Math.abs(amount), currency, { fractionDigits })}`;
}

/** "0.64%" — always unsigned; direction is carried by colour and the signed amount. */
export function formatPercentMagnitude(percent: number, fractionDigits: number = 2) {
  return `${Math.abs(percent).toFixed(fractionDigits)}%`;
}

/** Short Indian-style axis label: ₹1.2Cr · ₹8.4L · ₹45K. Only for chart axes. */
export function formatAxisAmount(value: number, currency: string = 'INR') {
  const symbol = CURRENCY_SYMBOLS[currency] ?? '';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (currency === 'INR') {
    if (abs >= 1e7) return `${sign}${symbol}${trim(abs / 1e7)}Cr`;
    if (abs >= 1e5) return `${sign}${symbol}${trim(abs / 1e5)}L`;
  } else {
    if (abs >= 1e6) return `${sign}${symbol}${trim(abs / 1e6)}M`;
  }
  if (abs >= 1e3) return `${sign}${symbol}${trim(abs / 1e3)}K`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

// Asset-class labels/colors now live in ./taxonomy.ts (full 39-type taxonomy).
// Re-exported here so existing imports from '../utils/currency' keep working.
export { ASSET_CLASS_LABELS, ASSET_CLASS_COLORS } from './taxonomy';
