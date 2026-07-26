import { create } from 'zustand';

interface UiState {
  theme: 'light' | 'dark';
  /** true = amounts hidden ("eye" closed), false = amounts revealed ("eye" open). */
  privacyMode: boolean;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  initTheme: () => void;
  initPrivacy: () => void;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Reveal state lives in sessionStorage (not localStorage) so it survives a
// page refresh but resets back to hidden the next time the app/tab is
// actually closed and reopened.
const REVEAL_KEY = 'aurafin-privacy-revealed-at';
const REVEAL_TTL_MS = 60_000; // auto re-hide 1 minute after opening the eye

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'light',
  privacyMode: true,
  initTheme: () => {
    const stored = localStorage.getItem('aurafin-theme');
    const theme: 'light' | 'dark' = stored === 'dark' ? 'dark' : 'light';
    applyTheme(theme);
    set({ theme });
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    localStorage.setItem('aurafin-theme', next);
    set({ theme: next });
  },
  // Called once on app start. If the eye was opened less than a minute ago
  // (i.e. this is a refresh, not a fresh app open), keep it open and resume
  // the countdown for whatever time is left; otherwise stay hidden.
  initPrivacy: () => {
    const revealedAt = Number(sessionStorage.getItem(REVEAL_KEY));
    const elapsed = revealedAt ? Date.now() - revealedAt : Infinity;

    if (revealedAt && elapsed < REVEAL_TTL_MS) {
      set({ privacyMode: false });
      clearAutoHideTimer();
      autoHideTimer = setTimeout(() => {
        sessionStorage.removeItem(REVEAL_KEY);
        set({ privacyMode: true });
      }, REVEAL_TTL_MS - elapsed);
    } else {
      sessionStorage.removeItem(REVEAL_KEY);
      set({ privacyMode: true });
    }
  },
  togglePrivacy: () =>
    set((s) => {
      const next = !s.privacyMode;
      clearAutoHideTimer();

      if (next === false) {
        // Opening the eye — remember when, so a refresh within the next
        // minute keeps it open, and schedule the auto re-hide.
        sessionStorage.setItem(REVEAL_KEY, String(Date.now()));
        autoHideTimer = setTimeout(() => {
          sessionStorage.removeItem(REVEAL_KEY);
          set({ privacyMode: true });
        }, REVEAL_TTL_MS);
      } else {
        // Manually closed — clear it immediately.
        sessionStorage.removeItem(REVEAL_KEY);
      }

      return { privacyMode: next };
    }),
}));
