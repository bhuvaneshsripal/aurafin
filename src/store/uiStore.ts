import { create } from 'zustand';

interface UiState {
  theme: 'light' | 'dark';
  /** true = amounts hidden ("eye" closed), false = amounts revealed ("eye" open). */
  privacyMode: boolean;
  /** When true, the global floating "+" add button hides itself — used by
   * pages that show their own bottom toolbar (e.g. bulk-selection actions)
   * in the same corner, so the two don't overlap. */
  hideFab: boolean;
  /** True while the global search panel is open — the mobile bottom nav and
   *  "+" button hide themselves so they don't sit above the keyboard. */
  searchOpen: boolean;
  /** True while the full-screen notifications page is open (hides the bottom nav). */
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  /** Desktop sidebar collapsed to an icon rail. (On tablet widths the rail is
   *  always used; on phones the bottom nav replaces the sidebar entirely.) */
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  initSidebar: () => void;
  toggleTheme: () => void;
  togglePrivacy: () => void;
  initTheme: () => void;
  initPrivacy: () => void;
  setHideFab: (hide: boolean) => void;
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

const SIDEBAR_KEY = 'aurafin-sidebar-collapsed';

// The collapsed state is driven from CSS (see index.css → --sb-w and the
// `.sb-*` rules) via a data attribute, so the sidebar, the Modal content
// panel and anything else that needs the sidebar's width stay in sync.
function applySidebar(collapsed: boolean) {
  document.documentElement.dataset.sidebar = collapsed ? 'collapsed' : 'expanded';
}

// The eye never closes by itself — there is no timer. Whatever the person
// last chose stays until they change it, or until the app is really closed.
//
// sessionStorage survives a refresh within the same tab, but is wiped the
// moment the tab/window/installed app is actually closed — exactly the
// "stay as it was across a refresh, but come back hidden once really closed"
// behavior this needs (same pattern as appLockStore's session-unlock key).
const REVEALED_KEY = 'aurafin-privacy-revealed';
// Older versions also stored a timestamp for a 15-minute auto-hide; clean it up.
const LEGACY_REVEALED_AT_KEY = 'aurafin-privacy-revealed-at';

function setRevealedSession(revealed: boolean) {
  try {
    if (revealed) sessionStorage.setItem(REVEALED_KEY, 'true');
    else sessionStorage.removeItem(REVEALED_KEY);
    sessionStorage.removeItem(LEGACY_REVEALED_AT_KEY);
  } catch {
    // storage unavailable — the eye just won't survive a refresh
  }
}

export const useUiStore = create<UiState>((set, get) => ({
  theme: 'light',
  privacyMode: true,
  hideFab: false,
  searchOpen: false,
  notificationsOpen: false,
  setNotificationsOpen: (open) => set({ notificationsOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  sidebarCollapsed: false,
  initSidebar: () => {
    let collapsed = false;
    try {
      collapsed = localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      // storage unavailable — default to expanded
    }
    applySidebar(collapsed);
    set({ sidebarCollapsed: collapsed });
  },
  toggleSidebar: () => {
    const next = !get().sidebarCollapsed;
    applySidebar(next);
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
    } catch {
      // ignore
    }
    set({ sidebarCollapsed: next });
  },
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
  // keeps the same sessionStorage, so an eye that was open stays open — with
  // no time limit. A genuinely fresh open (new tab, or the installed app
  // relaunched after being fully closed) gets a blank sessionStorage, so it
  // always comes back hidden (and RevealEyePrompt then offers to open it).
  initPrivacy: () => {
    let revealed = false;
    try {
      revealed = sessionStorage.getItem(REVEALED_KEY) === 'true';
    } catch {
      // storage unavailable — start hidden
    }
    set({ privacyMode: !revealed });
  },
  togglePrivacy: () =>
    set((s) => {
      const next = !s.privacyMode;
      // Remember the choice for this session only (survives a refresh, not a
      // full close). Closing the eye clears it, so a refresh keeps it closed.
      setRevealedSession(!next);
      return { privacyMode: next };
    }),
}));

// Mirror the eye onto <html> so CSS can also hide labels / columns that would
// sit next to an empty value (see `.privacy-hidden` in index.css).
if (typeof document !== 'undefined') {
  const sync = (hidden: boolean) => document.documentElement.classList.toggle('privacy-hidden', hidden);
  sync(useUiStore.getState().privacyMode);
  useUiStore.subscribe((s) => sync(s.privacyMode));
}
