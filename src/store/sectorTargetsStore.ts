import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TargetRange {
  /** Lowest share (% of your stocks + ETFs) you want in this sector. */
  min: number;
  /** Highest share you want in this sector. */
  max: number;
}

/** Range given to a sector when you add it yourself. */
export const NEW_SECTOR_RANGE: TargetRange = { min: 7, max: 10 };

/**
 * The sectors tracked out of the box, in the order they are listed at the top
 * of the Sector allocation card. Every one of them can be edited or removed,
 * and any other sector can be added (Sector targets > Add sector).
 */
export const DEFAULT_TARGETS: Record<string, TargetRange> = {
  banking: { min: 7, max: 10 },
  financial: { min: 7, max: 10 },
  capmarket: { min: 7, max: 10 },
  auto: { min: 7, max: 10 },
  it: { min: 7, max: 10 },
  capgoods: { min: 7, max: 10 },
  defence: { min: 7, max: 10 },
  pharma: { min: 7, max: 10 },
  power: { min: 7, max: 10 },
  gold: { min: 20, max: 25 },
};

/** A sector you typed in yourself. Holdings whose name or symbol contains `label` are placed in it. */
export interface CustomSector {
  label: string;
}

/** Stable key for a typed sector name. */
export const customKey = (label: string) => `custom:${label.trim().toLowerCase().replace(/\s+/g, '-')}`;

interface SectorTargetsState {
  enabled: boolean;
  /** Sectors added by typing, by key (see customKey). */
  customSectors: Record<string, CustomSector>;
  /** The tracked sectors and their allowed share. Key order = display order. */
  targets: Record<string, TargetRange>;
  setEnabled: (v: boolean) => void;
  setTarget: (key: string, range: TargetRange) => void;
  addTarget: (key: string) => void;
  /** Adds a sector by typed name; returns its key. */
  addCustom: (label: string) => string;
  removeTarget: (key: string) => void;
  reset: () => void;
}

export const useSectorTargetsStore = create<SectorTargetsState>()(
  persist(
    (set) => ({
      enabled: true,
      targets: DEFAULT_TARGETS,
      customSectors: {},
      setEnabled: (enabled) => set({ enabled }),
      setTarget: (key, range) => set((s) => ({ targets: { ...s.targets, [key]: range } })),
      addTarget: (key) => set((s) => (s.targets[key] ? s : { targets: { ...s.targets, [key]: NEW_SECTOR_RANGE } })),
      addCustom: (label) => {
        const clean = label.trim().replace(/\s+/g, ' ');
        const key = customKey(clean);
        set((s) => ({
          customSectors: { ...s.customSectors, [key]: { label: clean } },
          targets: s.targets[key] ? s.targets : { ...s.targets, [key]: NEW_SECTOR_RANGE },
        }));
        return key;
      },
      removeTarget: (key) =>
        set((s) => {
          const { [key]: _removed, ...rest } = s.targets;
          void _removed;
          const { [key]: _c, ...customs } = s.customSectors;
          void _c;
          return { targets: rest, customSectors: customs };
        }),
      reset: () => set({ targets: DEFAULT_TARGETS, customSectors: {}, enabled: true }),
    }),
    {
      name: 'aurafin-sector-targets',
      version: 3,
      // v1 tracked every sector; v2 starts from the 10 default sectors; v3 adds typed sectors.
      migrate: (old, version) =>
        (version < 2
          ? { enabled: true, targets: DEFAULT_TARGETS, customSectors: {} }
          : { ...(old as object), customSectors: (old as { customSectors?: object }).customSectors ?? {} }) as never,
    }
  )
);
