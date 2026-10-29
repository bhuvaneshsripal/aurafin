import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SectorProfile } from '../utils/sectors';

interface SectorProfilesState {
  /** Yahoo company profile per `IN:TCS` / `US:AAPL` key. `null` = looked up, nothing found. */
  profiles: Record<string, SectorProfile | null>;
  /** When each key was last looked up, so misses are retried after a few days. */
  fetchedAt: Record<string, number>;
  setProfiles: (batch: Record<string, SectorProfile | null>) => void;
}

/** Company sectors rarely change, so lookups are cached on the device. Market
 *  data isn't personal, so (like the price cache) it isn't cleared on logout. */
export const useSectorProfilesStore = create<SectorProfilesState>()(
  persist(
    (set) => ({
      profiles: {},
      fetchedAt: {},
      setProfiles: (batch) =>
        set((s) => {
          const now = Date.now();
          const fetchedAt = { ...s.fetchedAt };
          for (const k of Object.keys(batch)) fetchedAt[k] = now;
          return { profiles: { ...s.profiles, ...batch }, fetchedAt };
        }),
    }),
    { name: 'aurafin-sector-profiles' }
  )
);
