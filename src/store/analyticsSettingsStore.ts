import { create } from 'zustand';
import type { TargetAllocation } from '../utils/portfolioAnalytics';

const KEY = 'aurafin-analytics-settings-v1';

interface Persisted {
  targets: TargetAllocation;
  band: number;
  slabRate: number;
}

const DEFAULTS: Persisted = { targets: {}, band: 5, slabRate: 30 };

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
}

export const useAnalyticsSettingsStore = create<State>((set, get) => ({
  ...read(),
  setTargets: (targets) => {
    set({ targets });
    write({ targets, band: get().band, slabRate: get().slabRate });
  },
  setBand: (band) => {
    set({ band });
    write({ targets: get().targets, band, slabRate: get().slabRate });
  },
  setSlabRate: (slabRate) => {
    set({ slabRate });
    write({ targets: get().targets, band: get().band, slabRate });
  },
}));
