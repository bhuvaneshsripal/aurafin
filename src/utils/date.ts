/**
 * Locale- and timezone-independent date formatting.
 *
 * Two separate bugs live here, and this file fixes both:
 *
 * 1. `toLocaleDateString()` / `toLocaleString()` with no locale falls back
 *    to the browser's own locale, so the same date can render as
 *    MM/DD/YYYY on one device and DD/MM/YYYY on another.
 *
 * 2. A plain "YYYY-MM-DD" string (which is what every date picker in this
 *    app, and Firestore-synced dates like a transaction/asset date, stores)
 *    is parsed by `new Date(...)` as **UTC midnight**. Reading it back with
 *    local getters (getDate/getMonth/getFullYear, or toLocaleDateString
 *    without an explicit timeZone) then shows whatever calendar day that
 *    UTC instant falls on *in the viewer's own timezone* — so a date
 *    entered on one device (say India, UTC+5:30) can display a day earlier
 *    on another device west of UTC (say the US). Since these are dates
 *    people *chose* (not timestamps of an event), the calendar day must
 *    stay identical everywhere, so this never reads the string through a
 *    UTC-anchored Date object at all — the Y/M/D digits are parsed and
 *    formatted directly.
 */

/** Local calendar date as "YYYY-MM-DD" — the timezone-safe replacement for
 *  `date.toISOString().slice(0, 10)`. That pattern reads the *UTC* calendar
 *  day, which silently shifts a whole day earlier for anyone in a positive
 *  UTC offset (e.g. India, UTC+5:30): a Date built at local midnight — or
 *  just "right now" before ~5:30 AM local time — lands on the *previous*
 *  UTC day. Defaults to today. */
export function toIsoDate(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local calendar year-month as "YYYY-MM" — same fix as `toIsoDate`, for
 *  the month-picker/"this month" call sites that used
 *  `toISOString().slice(0, 7)`. Defaults to the current month. */
export function toIsoMonth(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/** Formats a date as "DD-MM-YYYY", e.g. 21-09-2026. Accepts a Date, an
 *  epoch number, or a "YYYY-MM-DD" (optionally with a time suffix) string —
 *  a bare "YYYY-MM-DD" is read as calendar digits, never through a
 *  timezone-anchored Date object, so it renders identically on every
 *  device regardless of the viewer's local timezone. */
export function formatDate(input: Date | string | number): string {
  if (typeof input === 'string') {
    const m = DATE_ONLY.exec(input);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  }
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

/** Formats a date + time as "DD-MM-YYYY, HH:MM" (24-hour clock), e.g.
 *  21-09-2026, 14:05. Unlike `formatDate`, this is always a real instant
 *  (a "generated at" / "saved at" moment), so — correctly — it's shown in
 *  the viewer's own local time, the same way a chat timestamp would be. */
export function formatDateTime(input: Date | string | number): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
