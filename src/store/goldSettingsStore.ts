import { create } from 'zustand';

const PREMIUM_KEY = 'aurafin-gold-premium-percent';

// Raw XAU/USD -> INR spot conversion (api/_lib/gold.js) systematically
// undershoots Indian retail/bullion quotes (Goodreturns, LiveChennai, MCX-
// based sites, etc.) because it has no import duty, GST, or dealer margin
// baked in. Last calibrated against those sources on 11 Aug 2026 (~14% gap
// — gold was unusually volatile that day, so the gap was wider than the
// more typical 8-10% duty+GST+margin range). This drifts as gold moves and
// as the spot-vs-retail lag changes, so it's user-adjustable in Settings >
// Preferences — recalibrate there whenever it looks off.
const DEFAULT_PREMIUM_PERCENT = 14;

function readStoredPremium(): number {
  const stored = Number(localStorage.getItem(PREMIUM_KEY));
  return Number.isFinite(stored) && localStorage.getItem(PREMIUM_KEY) !== null
    ? stored
    : DEFAULT_PREMIUM_PERCENT;
}

interface GoldSettingsState {
  /**
   * % added on top of the raw global-spot-derived rate to approximate a
   * local retail rate (import duty + GST + dealer margin). E.g. if your
   * trusted app (like Aura Gold) or a site like Goodreturns shows a rate 9%
   * above what Aurafin computes, set this to 9 and the two will line up.
   */
  premiumPercent: number;
  setPremiumPercent: (percent: number) => void;
  /** @deprecated premiumPercent now hydrates from localStorage at store
   * creation time, so calling init() is no longer required. Kept as a
   * no-op-safe re-read for any existing call sites. */
  init: () => void;
}

export const useGoldSettingsStore = create<GoldSettingsState>((set) => ({
  premiumPercent: readStoredPremium(),
  init: () => {
    set({ premiumPercent: readStoredPremium() });
  },
  setPremiumPercent: (percent) => {
    localStorage.setItem(PREMIUM_KEY, String(percent));
    set({ premiumPercent: percent });
  },
}));

/** Apply the calibration % on top of a raw global-spot-derived ₹/gram rate. */
export function applyGoldPremium(rawPricePerGram: number, premiumPercent: number): number {
  return rawPricePerGram * (1 + premiumPercent / 100);
}
