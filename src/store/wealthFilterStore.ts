import { create } from 'zustand';

/** The Assets tab's Category/Type/Currency filter selection. */
export interface WealthFilterSelection {
  categories: string[];
  types: string[];
  currencies: string[];
}

interface WealthFilterState extends WealthFilterSelection {
  /** True once the synced value (the Firestore doc, or guest localStorage)
   *  has been loaded at least once. Lets the Wealth page hold off applying
   *  its default filter render until it knows whether a saved selection is
   *  coming, instead of briefly showing "no filter" and then jumping to the
   *  real one a moment later. */
  loaded: boolean;
  setCategories: (v: string[]) => void;
  setTypes: (v: string[]) => void;
  setCurrencies: (v: string[]) => void;
  /** Called by useWealthFilterSync whenever the remote value changes
   *  (including on sign-out, with `null`, to clear it for the next account). */
  syncFromRemote: (v: WealthFilterSelection | null) => void;
}

export const useWealthFilterStore = create<WealthFilterState>((set) => ({
  categories: [],
  types: [],
  currencies: [],
  loaded: false,
  setCategories: (categories) => set({ categories }),
  setTypes: (types) => set({ types }),
  setCurrencies: (currencies) => set({ currencies }),
  syncFromRemote: (v) =>
    set({
      categories: v?.categories ?? [],
      types: v?.types ?? [],
      currencies: v?.currencies ?? [],
      loaded: true,
    }),
}));
