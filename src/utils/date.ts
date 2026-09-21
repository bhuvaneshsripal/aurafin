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

/** Stored "YYYY-MM-DD" (or "" / undefined) → "DD-MM-YYYY" text for a date
 *  field. Returns "" for anything that isn't a date. */
export function isoToDisplay(iso: string | undefined | null): string {
  return iso ? formatDate(iso) : '';
}

/** "DD-MM-YYYY" text → stored "YYYY-MM-DD", or null when the text isn't a
 *  complete, real calendar date (e.g. 31-02-2026 or 21-09-26). */
export function displayToIso(text: string): string | null {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100) return null;
  const probe = new Date(year, month - 1, day);
  if (probe.getFullYear() !== year || probe.getMonth() !== month - 1 || probe.getDate() !== day) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Live input mask for a DD-MM-YYYY text field: keeps digits only, inserts
 *  the "-" separators as the person types, and caps the length at 10.
 *  `prev` is the text before this keystroke so backspacing over a "-"
 *  works instead of the mask re-adding it. Pasting "2026-09-21" or
 *  "21/09/2026" is understood too. */
export function maskDateInput(raw: string, prev = ''): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim());
  if (iso) return `${iso[3]}-${iso[2]}-${iso[1]}`;
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  let out = digits.slice(0, 2);
  if (digits.length > 2) out += `-${digits.slice(2, 4)}`;
  if (digits.length > 4) out += `-${digits.slice(4)}`;
  else if ((digits.length === 2 || digits.length === 4) && raw.length > prev.length) out += '-';
  return out;
}
