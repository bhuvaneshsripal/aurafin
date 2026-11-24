// NSE/BSE weekday trading holidays (IST dates, "YYYY-MM-DD"). Weekends are handled separately.
// Keep in sync with MARKET_HOLIDAYS in src/utils/marketHours.ts and re-check against nseindia.com each January.
export const MARKET_HOLIDAYS = new Set([
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
