/** Shared date-range logic for the Money > Insights filter pills
 *  (This Month / Last Month / 3M / 6M / 12M / YTD / Custom). Kept here so
 *  the page header (which shows the resolved label, e.g. "July 2026") and
 *  the Insights tab body (which uses the start/end bounds to filter
 *  transactions) stay in sync without duplicating the date math. */

export type InsightsRangeKey = 'thisMonth' | 'lastMonth' | '3m' | '6m' | '12m' | 'ytd' | 'custom';

export const RANGE_OPTIONS: { key: InsightsRangeKey; label: string }[] = [
  { key: 'thisMonth', label: 'This Month' },
  { key: 'lastMonth', label: 'Last Month' },
  { key: '3m', label: '3M' },
  { key: '6m', label: '6M' },
  { key: '12m', label: '12M' },
  { key: 'ytd', label: 'YTD' },
  { key: 'custom', label: 'Custom' },
];

export interface InsightsRange {
  /** Inclusive ISO date (YYYY-MM-DD) */
  start: string;
  /** Inclusive ISO date (YYYY-MM-DD) */
  end: string;
  /** Human label shown under the page title, e.g. "July 2026" */
  label: string;
  /** How many calendar months the range roughly spans — used to compute
   *  the "₹X/mo" rate shown under each stat card. Always >= 1. */
  months: number;
}

function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(y: number, m: number): Date {
  return new Date(y, m, 1);
}

function endOfMonth(y: number, m: number): Date {
  return new Date(y, m + 1, 0);
}

function monthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

function shortMonthYear(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function formatDateShort(iso: string): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function getInsightsRange(key: InsightsRangeKey, customFrom?: string, customTo?: string): InsightsRange {
  const now = new Date();

  switch (key) {
    case 'thisMonth': {
      const start = startOfMonth(now.getFullYear(), now.getMonth());
      const end = endOfMonth(now.getFullYear(), now.getMonth());
      return { start: toISODate(start), end: toISODate(end), label: monthYear(now), months: 1 };
    }
    case 'lastMonth': {
      const ref = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const start = startOfMonth(ref.getFullYear(), ref.getMonth());
      const end = endOfMonth(ref.getFullYear(), ref.getMonth());
      return { start: toISODate(start), end: toISODate(end), label: monthYear(ref), months: 1 };
    }
    case '3m':
    case '6m':
    case '12m': {
      const months = key === '3m' ? 3 : key === '6m' ? 6 : 12;
      const startRef = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
      const start = startOfMonth(startRef.getFullYear(), startRef.getMonth());
      const end = endOfMonth(now.getFullYear(), now.getMonth());
      return {
        start: toISODate(start),
        end: toISODate(end),
        label: `${shortMonthYear(start)} – ${shortMonthYear(now)}`,
        months,
      };
    }
    case 'ytd': {
      const start = new Date(now.getFullYear(), 0, 1);
      return {
        start: toISODate(start),
        end: toISODate(now),
        label: `Jan – ${shortMonthYear(now)}`,
        months: now.getMonth() + 1,
      };
    }
    case 'custom': {
      const fallbackStart = toISODate(startOfMonth(now.getFullYear(), now.getMonth()));
      const fallbackEnd = toISODate(now);
      const start = customFrom || fallbackStart;
      const end = customTo || fallbackEnd;
      const days = Math.max(1, Math.round((new Date(`${end}T00:00:00`).getTime() - new Date(`${start}T00:00:00`).getTime()) / 86400000) + 1);
      return {
        start,
        end,
        label: start === end ? formatDateShort(start) : `${formatDateShort(start)} – ${formatDateShort(end)}`,
        months: Math.max(1, Math.round(days / 30)),
      };
    }
  }
}
