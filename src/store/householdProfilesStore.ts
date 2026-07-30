import { create } from 'zustand';
import type { HouseholdProfile } from '../types';

const ACTIVE_PROFILE_KEY = 'aurafin-active-profile';

function getStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

interface HouseholdProfilesState {
  profiles: HouseholdProfile[];
  /** null = "All / Household" combined view. */
  activeProfileId: string | null;
  setProfiles: (profiles: HouseholdProfile[]) => void;
  setActiveProfileId: (id: string | null) => void;
}

export const useHouseholdProfilesStore = create<HouseholdProfilesState>((set) => ({
  profiles: [],
  activeProfileId: getStoredActiveId(),
  setProfiles: (profiles) =>
    set({ profiles: [...profiles].sort((a, b) => a.createdAt - b.createdAt) }),
  setActiveProfileId: (id) => {
    try {
      if (id) localStorage.setItem(ACTIVE_PROFILE_KEY, id);
      else localStorage.removeItem(ACTIVE_PROFILE_KEY);
    } catch {
      // ignore storage failures (private browsing, etc.)
    }
    set({ activeProfileId: id });
  },
}));

/** A handful of pleasant, distinguishable avatar colours to offer when
 *  creating a new household profile. */
export const PROFILE_COLOURS = [
  '#2c6e49', // brand green
  '#8a3b2e', // rust
  '#5b6ee1', // indigo
  '#c9932a', // gold
  '#0f766e', // teal
  '#be185d', // rose
  '#7c3aed', // violet
  '#334155', // slate
];
