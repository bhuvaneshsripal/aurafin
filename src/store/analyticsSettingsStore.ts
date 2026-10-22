import { create } from 'zustand';
import type { TargetAllocation } from '../utils/portfolioAnalytics';

const KEY = 'aurafin-analytics-settings-v1';

interface Persisted {
  targets: TargetAllocation;
  band: number;
  slabRate: number;
  /** Max share of the portfolio any single holding should take, in %. */
  holdingLimit: number;
}

const DEFAULTS: Persisted = { targets: {}, band: 5, slabRate: 30, holdingLimit: 10 };

function read(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function write(p: Persisted) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable (private mode) — settings just won't persist */
  }
}

interface State extends Persisted {
  setTargets: (t: TargetAllocation) => void;
  setBand: (b: number) => void;
  setSlabRate: (r: number) => void;
  setHoldingLimit: (l: number) => void;
}

export const useAnalyticsSettingsStore = create<State>((set, get) => {
  const snapshot = (): Persisted => {
    const s = get();
    return { targets: s.targets, band: s.band, slabRate: s.slabRate, holdingLimit: s.holdingLimit };
  };
  return {
    ...read(),
    setTargets: (targets) => {
      set({ targets });
      write({ ...snapshot(), targets });
    },
    setBand: (band) => {
      set({ band });
      write({ ...snapshot(), band });
    },
    setSlabRate: (slabRate) => {
      set({ slabRate });
      write({ ...snapshot(), slabRate });
    },
    setHoldingLimit: (holdingLimit) => {
      set({ holdingLimit });
      write({ ...snapshot(), holdingLimit });
    },
  };
});
