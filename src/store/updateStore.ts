import { create } from 'zustand';

interface UpdateState {
  /** True once a newer deployed version has been downloaded and is waiting. */
  updateAvailable: boolean;
  setUpdateAvailable: (v: boolean) => void;
}

export const useUpdateStore = create<UpdateState>((set) => ({
  updateAvailable: false,
  setUpdateAvailable: (v) => set({ updateAvailable: v }),
}));
