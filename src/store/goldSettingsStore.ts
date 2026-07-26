import { create } from 'zustand';

const PREMIUM_KEY = 'aurafin-gold-premium-percent';

interface GoldSettingsState {
  /**
   * % added on top of the raw global-spot-derived rate to approximate a
   * local retail rate (import duty + GST + dealer margin). E.g. if your
   * trusted app (like Aura Gold) shows a rate 9% above what Aurafin
   * computes, set this to 9 and the two will line up.
   */
  premiumPercent: number;
  setPremiumPercent: (percent: number) => void;
  init: () => void;
}

export const useGoldSettingsStore = create<GoldSettingsState>((set) => ({
  premiumPercent: 0,
  init: () => {
    const stored = Number(localStorage.getItem(PREMIUM_KEY));
    set({ premiumPercent: Number.isFinite(stored) ? stored : 0 });
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
