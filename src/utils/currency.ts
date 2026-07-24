export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'SGD', 'AED', 'AUD', 'CAD', 'JPY'] as const;

export function formatCurrency(value: number, currency: string = 'INR') {
  try {
    return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString()}`;
  }
}

export function formatCompact(value: number, currency: string = 'INR') {
  const formatted = formatCurrency(value, currency);
  return formatted;
}

export const ASSET_CLASS_LABELS: Record<string, string> = {
  equity: 'Equity',
  mutual_fund: 'Mutual Funds',
  real_estate: 'Real Estate',
  gold: 'Gold & SGBs',
  epf_ppf: 'EPF & PPF',
  nps: 'NPS',
  fixed_deposit: 'Fixed Deposits',
  crypto: 'Crypto',
  cash: 'Cash',
  other: 'Other',
};

export const ASSET_CLASS_COLORS: Record<string, string> = {
  equity: '#16a35d',
  mutual_fund: '#22c274',
  real_estate: '#4ade93',
  gold: '#f5b942',
  epf_ppf: '#3b82f6',
  nps: '#8b5cf6',
  fixed_deposit: '#06b6d4',
  crypto: '#f97316',
  cash: '#94a3b8',
  other: '#64748b',
};
