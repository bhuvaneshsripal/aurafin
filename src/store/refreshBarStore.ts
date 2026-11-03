import { create } from 'zustand';

/** True while a "tap the page you're already on" refresh is running. Drives the
 *  green progress line under the index bar (see RefreshBar). */
interface RefreshBarState {
  active: boolean;
  setActive: (active: boolean) => void;
}

export const useRefreshBarStore = create<RefreshBarState>((set) => ({
  active: false,
  setActive: (active) => set({ active }),
}));
