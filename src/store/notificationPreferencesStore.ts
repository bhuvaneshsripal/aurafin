import { create } from 'zustand';

/** Every togglable notification channel shown on the Settings ▸
 *  Preferences ▸ Notifications card. Not every notification type has
 *  every channel — e.g. "Weekly portfolio digest" is email-only and
 *  "Budget alerts" is in-app-only — so this is a flat set of keys rather
 *  than a nested { type: { email, inApp } } shape; the UI only renders
 *  the keys it actually has a toggle for. */
export type NotificationChannelKey = 'weeklyDigestEmail' | 'budgetAlertsInApp';

const STORAGE_KEY = 'aurafin-notification-prefs';
const LAST_SENT_KEY = 'aurafin-weekly-digest-last-sent';

// Both channels default to on, matching what a newly signed-up person
// would expect (opted in, not opted out).
const DEFAULT_PREFS: Record<NotificationChannelKey, boolean> = {
  weeklyDigestEmail: true,
  budgetAlertsInApp: true,
};

function loadStoredPrefs(): Record<NotificationChannelKey, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw);
    // Merge over the defaults rather than trusting the stored blob as-is,
    // so a channel added in a later app update (not present in an old
    // saved blob) still shows up defaulted on instead of `undefined`.
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

interface NotificationPreferencesState {
  prefs: Record<NotificationChannelKey, boolean>;
  /** IST date-key ("YYYY-MM-DD") of the last Saturday the weekly digest
   *  was actually sent for — used to send it once per week rather than
   *  every time the due-check runs during Saturday's send window. */
  weeklyDigestLastSentFor: string | null;
  init: () => void;
  toggle: (key: NotificationChannelKey) => void;
  markWeeklyDigestSent: (dateKey: string) => void;
}

// Read synchronously at store-creation time (not inside init()'s useEffect)
// so weeklyDigestLastSentFor is already correct the very first time
// useWeeklyDigestScheduler's effect runs. Child effects run before parent
// effects in React, so WeeklyDigestSync's check() used to fire before
// App's init() effect had loaded this from localStorage — on every app
// mount/reload during Saturday's send window, that stale `null` made the
// scheduler think the digest hadn't been sent yet and send it again.
function loadStoredLastSentFor(): string | null {
  try {
    return localStorage.getItem(LAST_SENT_KEY);
  } catch {
    // Ignore — falls back to null, which just means it hasn't been sent
    // yet as far as this device knows.
    return null;
  }
}

export const useNotificationPreferencesStore = create<NotificationPreferencesState>((set, get) => ({
  prefs: loadStoredPrefs(),
  weeklyDigestLastSentFor: loadStoredLastSentFor(),

  init: () => {
    set({ prefs: loadStoredPrefs(), weeklyDigestLastSentFor: loadStoredLastSentFor() });
  },

  toggle: (key) => {
    const next = { ...get().prefs, [key]: !get().prefs[key] };
    set({ prefs: next });
    // Changes take effect immediately — persisted straight away rather
    // than waiting on a separate "Save" action.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Best-effort — a full/unavailable localStorage shouldn't crash the
      // toggle itself; the in-memory state above still reflects the click.
    }
  },

  markWeeklyDigestSent: (dateKey) => {
    set({ weeklyDigestLastSentFor: dateKey });
    try {
      localStorage.setItem(LAST_SENT_KEY, dateKey);
    } catch {
      // Best-effort — worst case it re-sends once more this Saturday.
    }
  },
}));
