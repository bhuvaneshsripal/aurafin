import { create } from 'zustand';

interface UiState {
  theme: 'light' | 'dark';
  /** true = amounts hidden ("eye" closed), false = amounts revealed ("eye" open). */
  privacyMode: boolean;
  /** When true, the global floating "+" add button hides itself — used by
   * pages that show their own bottom toolbar (e.g. bulk-selection actions)
   * in the same corner, so the two don't overlap. */
  hideFab: boolean;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  initTheme: () => void;
  initPrivacy: () => void;
  setHideFab: (hide: boolean) => void;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// Auto re-hide amounts 15 minutes after opening the eye.
const REVEAL_TTL_MS = 15 * 60_000;

// sessionStorage survives a refresh within the same tab, but is wiped the
// moment the tab/window/installed app is actually closed — exactly the
// "stay revealed across a refresh, but re-hide once really closed" behavior
// this needs (same pattern as appLockStore's session-unlock key).
const REVEALED_KEY = 'aurafin-privacy-revealed';
const REVEALED_AT_KEY = 'aurafin-privacy-revealed-at';

let autoHideTimer: ReturnType<typeof setTimeout> | null = null;

function clearAutoHideTimer() {
  if (autoHideTimer) {
    clearTimeout(autoHideTimer);
    autoHideTimer = null;
  }
}

function clearRevealedSession() {
  sessionStorage.removeItem(REVEALED_KEY);
  sessionStorage.removeItem(REVEALED_AT_KEY);
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'light',
  privacyMode: true,
  hideFab: false,
  setHideFab: (hide) => set({ hideFab: hide }),
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
  // Called once on app start, including a plain page refresh. A refresh
  // keeps the same sessionStorage, so if the eye was open and it's been
  // under 15 minutes, it stays open (with a fresh timer for the remaining
  // time). A genuinely fresh open (new tab, or the installed app relaunched
  // after being fully closed) gets a blank sessionStorage, so it always
  // comes back hidden.
  initPrivacy: () => {
    clearAutoHideTimer();
    const revealed = sessionStorage.getItem(REVEALED_KEY) === 'true';
    if (!revealed) {
      set({ privacyMode: true });
      return;
    }
    const revealedAt = parseInt(sessionStorage.getItem(REVEALED_AT_KEY) ?? '0', 10);
    const remaining = REVEAL_TTL_MS - (Date.now() - revealedAt);
    if (!revealedAt || remaining <= 0) {
      clearRevealedSession();
      set({ privacyMode: true });
      return;
    }
    autoHideTimer = setTimeout(() => {
      clearRevealedSession();
      set({ privacyMode: true });
    }, remaining);
    set({ privacyMode: false });
  },
  togglePrivacy: () =>
    set((s) => {
      const next = !s.privacyMode;
      clearAutoHideTimer();

      if (next === false) {
        // Opening the eye — remember it in sessionStorage (so a refresh
        // keeps it open) and auto re-hide after 15 minutes for safety.
        sessionStorage.setItem(REVEALED_KEY, 'true');
        sessionStorage.setItem(REVEALED_AT_KEY, String(Date.now()));
        autoHideTimer = setTimeout(() => {
          clearRevealedSession();
          set({ privacyMode: true });
        }, REVEAL_TTL_MS);
      } else {
        // Manually closing the eye — clear the session flag too, so a
        // refresh right after doesn't reopen it.
        clearRevealedSession();
      }

      return { privacyMode: next };
    }),
}));
