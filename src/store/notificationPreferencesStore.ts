import { create } from 'zustand';

/** Every togglable notification channel shown on the Settings ▸
 *  Preferences ▸ Notifications card. Not every notification type has
 *  every channel — e.g. "Weekly portfolio digest" is email-only and
 *  "Budget alerts" is in-app-only — so this is a flat set of keys rather
 *  than a nested { type: { email, inApp } } shape; the UI only renders
 *  the keys it actually has a toggle for. */
export type NotificationChannelKey = 'weeklyDigestEmail' | 'budgetAlertsInApp';

/** Advanced notification controls shown on Settings ▸ Notifications ▸ Advanced.
 *  These only affect alerts raised while the app is running; alerts the server
 *  pushes while the app is closed are not filtered by them. */
export interface AdvancedNotificationSettings {
  /** Pre-market (9:00), market-open (9:15) and market-close (3:30 PM) summaries. */
  sessionPreOpen: boolean;
  sessionOpen: boolean;
  sessionClose: boolean;
  /** Alert when Nifty / Sensex / Bank Nifty move 2% or 5%. */
  indexMoves: boolean;
  /** Alert when a holding crosses any of these % moves vs the previous close (pick one or more). */
  holdingMoveLevels: number[];
  /** No phone pop-ups between quietStart and quietEnd (IST, "HH:MM"). They still appear in the bell. */
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
}

export const HOLDING_MOVE_OPTIONS = [2, 3, 4, 5] as const;

export const DEFAULT_ADVANCED: AdvancedNotificationSettings = {
  sessionPreOpen: true,
  sessionOpen: true,
  sessionClose: true,
  indexMoves: true,
  holdingMoveLevels: [4, 5], // same as the original fixed 4% / 5% levels
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '07:00',
};

const ADVANCED_KEY = 'aurafin-notification-advanced';

function loadStoredAdvanced(): AdvancedNotificationSettings {
  try {
    const raw = localStorage.getItem(ADVANCED_KEY);
    if (!raw) return { ...DEFAULT_ADVANCED };
    const parsed = JSON.parse(raw);
    // Older saves kept a single threshold (plus the implicit 5%).
    if (typeof parsed.holdingMovePct === 'number' && !Array.isArray(parsed.holdingMoveLevels)) {
      parsed.holdingMoveLevels = [...new Set([parsed.holdingMovePct, 5])].sort((a, b) => a - b);
    }
    delete parsed.holdingMovePct;
    const merged = { ...DEFAULT_ADVANCED, ...parsed };
    if (!Array.isArray(merged.holdingMoveLevels) || merged.holdingMoveLevels.length === 0) {
      merged.holdingMoveLevels = [...DEFAULT_ADVANCED.holdingMoveLevels];
    }
    return merged;
  } catch {
    return { ...DEFAULT_ADVANCED };
  }
}

/** True when `nowMins` (minutes since midnight) is inside the quiet window; handles overnight windows. */
export function isInQuietHours(a: AdvancedNotificationSettings, nowMins: number): boolean {
  if (!a.quietHoursEnabled) return false;
  const toMins = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  };
  const start = toMins(a.quietStart);
  const end = toMins(a.quietEnd);
  if (start === end) return false;
  return start < end ? nowMins >= start && nowMins < end : nowMins >= start || nowMins < end;
}

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
  advanced: AdvancedNotificationSettings;
  setAdvanced: (patch: Partial<AdvancedNotificationSettings>) => void;
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
  advanced: loadStoredAdvanced(),
  weeklyDigestLastSentFor: loadStoredLastSentFor(),

  init: () => {
    set({ prefs: loadStoredPrefs(), advanced: loadStoredAdvanced(), weeklyDigestLastSentFor: loadStoredLastSentFor() });
  },

  setAdvanced: (patch) => {
    const next = { ...get().advanced, ...patch };
    set({ advanced: next });
    try {
      localStorage.setItem(ADVANCED_KEY, JSON.stringify(next));
    } catch {
      // Best-effort, same as toggle().
    }
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
