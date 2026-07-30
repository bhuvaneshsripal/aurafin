import { create } from 'zustand';
import type { HouseholdProfile } from '../types';

const ACTIVE_PROFILE_KEY = 'aurafin-active-profile';
// Separate from ACTIVE_PROFILE_KEY itself, since that key is *absent* both
// when this device has never chosen a profile AND when it explicitly chose
// "All Profiles" (removed on purpose) — this flag disambiguates the two so
// the synced default below is only ever applied once, on a truly new device.
const INIT_FLAG_KEY = 'aurafin-profile-init';

function getStoredActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PROFILE_KEY);
  } catch {
    return null;
  }
}

function hasInitializedLocally(): boolean {
  try {
    return localStorage.getItem(INIT_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function markInitializedLocally() {
  try {
    localStorage.setItem(INIT_FLAG_KEY, '1');
  } catch {
    // ignore storage failures (private browsing, etc.)
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
  setProfiles: (profiles) => {
    const sorted = [...profiles].sort((a, b) => a.createdAt - b.createdAt);

    // Fresh device (or fresh browser/private session) signing into an
    // existing account: open to whichever profile the account has marked
    // as its default, rather than defaulting to "All Profiles".
    if (!hasInitializedLocally()) {
      const remoteDefault = sorted.find((p) => p.isDefault);
      if (remoteDefault) {
        markInitializedLocally();
        try {
          localStorage.setItem(ACTIVE_PROFILE_KEY, remoteDefault.id);
        } catch {
          // ignore storage failures (private browsing, etc.)
        }
        set({ profiles: sorted, activeProfileId: remoteDefault.id });
        return;
      }
    }

    set({ profiles: sorted });
  },
  setActiveProfileId: (id) => {
    markInitializedLocally();
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
