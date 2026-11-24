import { create } from 'zustand';

/** The signed-in person's active view-only link (null = not sharing). Filled by useShareSync. */
interface ShareState {
  token: string | null;
  /** False until the first answer from Firestore, so Settings doesn't flash "not sharing". */
  ready: boolean;
  setToken: (token: string | null) => void;
  setReady: (ready: boolean) => void;
}

export const useShareStore = create<ShareState>((set) => ({
  token: null,
  ready: false,
  setToken: (token) => set({ token, ready: true }),
  setReady: (ready) => set({ ready }),
}));
