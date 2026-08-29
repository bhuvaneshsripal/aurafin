import { useEffect, useState } from 'react';

/** NSE's cash-market pre-open session starts at 9:00 AM IST and normal
 *  trading begins at 9:15 AM IST. From 5:30 AM IST — well after the
 *  previous session has settled — up to that open, we treat "1D returns"
 *  as a flat 0 instead of showing last night's now-stale change, since the
 *  exchange hasn't published today's LTP/previous-close yet. Once the
 *  market opens and fresh quotes start flowing in via useLivePrices, the
 *  real day change takes over again automatically. */
const RESET_HOUR = 5;
const RESET_MINUTE = 30;
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 15;
const MARKET_CLOSE_HOUR = 15;
const MARKET_CLOSE_MINUTE = 30;

/** Current wall-clock time in India (Asia/Kolkata), regardless of the
 *  device's own timezone. */
function getIstTimeOfDay(now: Date = new Date()): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/** Today's date in India (Asia/Kolkata) as "YYYY-MM-DD" and the ISO
 *  weekday (1 = Monday ... 7 = Sunday), independent of the device's own
 *  timezone/locale. Used to key "have we already sent this week's digest"
 *  so it fires once per Saturday rather than every time the check runs. */
function getIstDateInfo(now: Date = new Date()): { dateKey: string; isoWeekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(now);
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const weekdayShort = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon';
  const WEEKDAY_MAP: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return { dateKey: `${year}-${month}-${day}`, isoWeekday: WEEKDAY_MAP[weekdayShort] ?? 1 };
}

/** True from 5:30 AM IST up to (not including) 9:15 AM IST — the daily
 *  window where "1D returns" / day-change figures should reset to 0. */
export function isDayChangeResetWindow(now: Date = new Date()): boolean {
  const { hour, minute } = getIstTimeOfDay(now);
  const minutesSinceMidnight = hour * 60 + minute;
  const resetStart = RESET_HOUR * 60 + RESET_MINUTE;
  const marketOpen = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  return minutesSinceMidnight >= resetStart && minutesSinceMidnight < marketOpen;
}

/** Reactive version of isDayChangeResetWindow — re-checks every 30s so the
 *  UI flips over right at 5:30 AM and again at market open even if nothing
 *  else re-renders the component in between. */
export function useDayChangeResetWindow(): boolean {
  const [active, setActive] = useState(() => isDayChangeResetWindow());
  useEffect(() => {
    const id = setInterval(() => setActive(isDayChangeResetWindow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return active;
}

/** True during NSE's live trading window — Mon–Fri, 9:15 AM–3:30 PM IST.
 *  Unlike getMarketSessionProgress (which only looks at time-of-day and is
 *  meant for drawing how far a chart should trail across), this also knows
 *  about weekends, so it's the right check for "is the market actually
 *  open right now" — e.g. gating whether to show a live intraday
 *  sparkline at all. */
export function isMarketOpen(now: Date = new Date()): boolean {
  const { hour, minute } = getIstTimeOfDay(now);
  const { isoWeekday } = getIstDateInfo(now);
  if (isoWeekday > 5) return false; // Saturday (6) or Sunday (7)
  const minutesSinceMidnight = hour * 60 + minute;
  const marketOpen = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const marketClose = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  return minutesSinceMidnight >= marketOpen && minutesSinceMidnight < marketClose;
}

/** Reactive version of isMarketOpen — re-checks every 30s so the sparkline
 *  appears right at 9:15 AM IST without needing another render to trigger
 *  it. */
export function useIsMarketOpen(): boolean {
  const [open, setOpen] = useState(() => isMarketOpen());
  useEffect(() => {
    const id = setInterval(() => setOpen(isMarketOpen()), 30_000);
    return () => clearInterval(id);
  }, []);
  return open;
}
/** How far through today's 9:15 AM–3:30 PM IST trading session we currently
 *  are, as a fraction from 0 (not open yet) to 1 (session over for the
 *  day). Used to draw "live" charts (like the 1D sparkline) so they only
 *  fill in up to the current moment while the market is running — the way
 *  a real broker app's intraday chart trails off partway through the
 *  day — rather than stretching a full day's worth of line across the
 *  width before the day is actually over. */
export function getMarketSessionProgress(now: Date = new Date()): number {
  const { hour, minute } = getIstTimeOfDay(now);
  const minutesSinceMidnight = hour * 60 + minute;
  const marketOpen = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  const marketClose = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE;
  if (minutesSinceMidnight <= marketOpen) return 0;
  if (minutesSinceMidnight >= marketClose) return 1;
  return (minutesSinceMidnight - marketOpen) / (marketClose - marketOpen);
}

/** Reactive version of getMarketSessionProgress — re-checks every 30s so a
 *  live chart keeps trailing forward through the trading day. */
export function useMarketSessionProgress(): number {
  const [progress, setProgress] = useState(() => getMarketSessionProgress());
  useEffect(() => {
    const id = setInterval(() => setProgress(getMarketSessionProgress()), 30_000);
    return () => clearInterval(id);
  }, []);
  return progress;
}

const DIGEST_HOUR = 10; // 10:00 AM IST, Saturday — like Zerodha's weekly digest.

/** Whether right now is Saturday at/after 10:00 AM IST — the weekly
 *  portfolio digest's send window — plus today's IST date-key so the
 *  caller can track "already sent for this date" and avoid re-sending
 *  every time the check re-runs later the same Saturday. */
export function getWeeklyDigestWindow(now: Date = new Date()): { due: boolean; dateKey: string } {
  const { hour } = getIstTimeOfDay(now);
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  const due = isoWeekday === 6 && hour >= DIGEST_HOUR;
  return { due, dateKey };
}
