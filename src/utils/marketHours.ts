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
