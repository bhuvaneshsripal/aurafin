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

/** Weekday exchange holidays (IST dates, "YYYY-MM-DD") on which NSE/BSE are
 *  closed — add them from the official NSE holiday list each year. Weekends
 *  are handled automatically and don't need to be listed. */
export const MARKET_HOLIDAYS = new Set<string>([
  // 2026 NSE/BSE equity-segment weekday holidays (per NSE's circular). Weekend
  // festivals (e.g. Diwali Laxmi Pujan, Sun 8-Nov, which only has a Muhurat
  // session) need no entry. Re-check against nseindia.com each January.
  '2026-01-26', // Republic Day
  '2026-03-03', // Holi
  '2026-03-31', // Shri Mahavir Jayanti
  '2026-04-03', // Good Friday
  '2026-04-14', // Dr. Baba Saheb Ambedkar Jayanti
  '2026-05-01', // Maharashtra Day
  '2026-06-26', // Muharram
  '2026-10-02', // Mahatma Gandhi Jayanti
  '2026-10-20', // Dussehra
  '2026-11-10', // Diwali Balipratipada
  '2026-11-24', // Guru Nanak Jayanti
  '2026-12-25', // Christmas
]);

/** Special trading sessions on days that are normally closed (IST date -> minutes since midnight).
 *  Diwali Muhurat trading is held on a weekend this year: Sun 8-Nov-2026, 2:20-3:30 PM IST
 *  (pre-open 2:05-2:20 PM, per NSE/BSE). Add the new dates from NSE's circular each year. */
export const SPECIAL_SESSIONS: Record<string, { open: number; close: number }> = {
  '2026-11-08': { open: 14 * 60 + 20, close: 15 * 60 + 30 },
};

const REGULAR_SESSION = {
  open: MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE,
  close: MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE,
};

/** Today's trading session in minutes since midnight IST, or null when nothing trades today. */
function sessionFor(dateKey: string, isoWeekday: number): { open: number; close: number } | null {
  const special = SPECIAL_SESSIONS[dateKey];
  if (special) return special;
  if (isoWeekday > 5 || MARKET_HOLIDAYS.has(dateKey)) return null;
  return REGULAR_SESSION;
}

// Intl.DateTimeFormat construction is slow (tens of microseconds on a desktop,
// a millisecond or more on a low-end phone, and timeZone makes it slower
// still). These helpers run on every poll tick and every render of the live
// price UI, so each formatter is built once, on first use, and then reused.
let istTimeFormatter: Intl.DateTimeFormat | undefined;
let istDateFormatter: Intl.DateTimeFormat | undefined;
let sessionLabelFormatter: Intl.DateTimeFormat | undefined;

/** Current wall-clock time in India (Asia/Kolkata), regardless of the
 *  device's own timezone. */
export function getIstTimeOfDay(now: Date = new Date()): { hour: number; minute: number } {
  if (!istTimeFormatter) {
    istTimeFormatter = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
  const parts = istTimeFormatter.formatToParts(now);
  // `% 24`: some engines print midnight as "24" with hour12:false.
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0') % 24;
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hour, minute };
}

/** Today's date in India (Asia/Kolkata) as "YYYY-MM-DD" and the ISO
 *  weekday (1 = Monday ... 7 = Sunday), independent of the device's own
 *  timezone/locale. Used to key "have we already sent this week's digest"
 *  so it fires once per Saturday rather than every time the check runs. */
export function getIstDateInfo(now: Date = new Date()): { dateKey: string; isoWeekday: number } {
  if (!istDateFormatter) {
    istDateFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
    });
  }
  const parts = istDateFormatter.formatToParts(now);
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
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  const minutesSinceMidnight = hour * 60 + minute;
  const marketOpen = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
  // No session today (weekend or listed exchange holiday): nothing has
  // traded, so "1D returns" is flat all day instead of replaying the last
  // session's change.
  const special = SPECIAL_SESSIONS[dateKey];
  if (special) return minutesSinceMidnight < special.open; // special session: live once it opens
  if (isoWeekday > 5 || MARKET_HOLIDAYS.has(dateKey)) return true;
  // Monday before the open: the last session was Friday, which is stale.
  if (isoWeekday === 1 && minutesSinceMidnight < marketOpen) return true;
  const resetStart = RESET_HOUR * 60 + RESET_MINUTE;
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

/** The top-bar index strip (NIFTY / SENSEX / BANKNIFTY) starts the new day
 *  earlier than the holdings' "1D returns" reset: from 4:30 AM IST. */
const INDEX_RESET_HOUR = 4;
const INDEX_RESET_MINUTE = 30;

/** True on a trading day (Mon–Fri, not a listed exchange holiday) from
 *  4:30 AM IST up to the 9:15 AM IST open — the window where the index strip
 *  shows 0 instead of yesterday's closing levels. Weekends and holidays are
 *  not reset: nothing new is about to trade, so the last close stays. */
export function isIndexResetWindow(now: Date = new Date()): boolean {
  const { hour, minute } = getIstTimeOfDay(now);
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  if (isoWeekday > 5 || MARKET_HOLIDAYS.has(dateKey)) return false;
  const mins = hour * 60 + minute;
  return mins >= INDEX_RESET_HOUR * 60 + INDEX_RESET_MINUTE && mins < MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;
}

/** Index levels start moving in the NSE pre-open session (9:00–9:15) and the
 *  closing prints land a little after 3:30 PM, so the top-bar strip polls every
 *  second from 8:55 AM to 3:45 PM IST on trading days — not only 9:15–3:30,
 *  which left the first (and last) quotes up to 30 seconds late. */
export function isIndexPollingWindow(now: Date = new Date()): boolean {
  const { hour, minute } = getIstTimeOfDay(now);
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  const session = sessionFor(dateKey, isoWeekday);
  if (!session) return false;
  const mins = hour * 60 + minute;
  if (session !== REGULAR_SESSION) return mins >= session.open - 20 && mins < session.close + 15;
  return mins >= 8 * 60 + 55 && mins < 15 * 60 + 45;
}

/** Reactive version of isIndexResetWindow — re-checks every 30s so the strip
 *  flips to 0 at 4:30 AM and back to live values at the open without a reload. */
export function useIndexResetWindow(): boolean {
  const [active, setActive] = useState(() => isIndexResetWindow());
  useEffect(() => {
    const id = setInterval(() => setActive(isIndexResetWindow()), 30_000);
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
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  const session = sessionFor(dateKey, isoWeekday); // null on weekends / listed holidays
  if (!session) return false;
  const minutesSinceMidnight = hour * 60 + minute;
  return minutesSinceMidnight >= session.open && minutesSinceMidnight < session.close;
}

/** Date of the most recent NSE/BSE session that has started, formatted like
 *  "Fri, 09 Oct 2026". During or after today's session that is today;
 *  before the open, on weekends and on listed holidays it walks back to the
 *  previous trading day. Used for the "Market closed · <date>" label. */
export function getLastSessionLabel(now: Date = new Date()): string {
  const { hour, minute } = getIstTimeOfDay(now);
  const { dateKey, isoWeekday } = getIstDateInfo(now);
  const session = sessionFor(dateKey, isoWeekday);
  const tradingToday = session !== null;
  const started = session !== null && hour * 60 + minute >= session.open;
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d, 12));
  if (!(tradingToday && started)) {
    do {
      day.setUTCDate(day.getUTCDate() - 1);
    } while (
      !SPECIAL_SESSIONS[day.toISOString().slice(0, 10)] &&
      (day.getUTCDay() === 0 ||
        day.getUTCDay() === 6 ||
        MARKET_HOLIDAYS.has(day.toISOString().slice(0, 10)))
    );
  }
  if (!sessionLabelFormatter) {
    sessionLabelFormatter = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'UTC',
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }
  return sessionLabelFormatter.format(day);
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
  const { dateKey } = getIstDateInfo(now);
  const { open: marketOpen, close: marketClose } = SPECIAL_SESSIONS[dateKey] ?? REGULAR_SESSION;
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
