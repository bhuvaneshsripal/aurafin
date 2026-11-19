import { useEffect, useMemo } from 'react';
import { useBudgetStore } from '../store/budgetStore';
import { useTransactionsStore } from '../store/transactionsStore';
import { useHouseholdProfilesStore } from '../store/householdProfilesStore';
import { useAlertsStore } from '../store/alertsStore';
import { useNotificationPreferencesStore } from '../store/notificationPreferencesStore';
import { useAuthStore } from '../store/authStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { budgetKey, canonicalCategory } from '../utils/budgetCategories';
import { getIstDateInfo } from '../utils/marketHours';
import { formatCurrency } from '../utils/currency';

/** Budget alert levels, as a % of a category's budget for the month. */
const LEVELS = [80, 100] as const;
const FIRED_KEY = 'aurafin-budget-alerts-fired';

function loadFired(month: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(FIRED_KEY) ?? 'null');
    if (raw && raw.month === month && Array.isArray(raw.keys)) return new Set<string>(raw.keys);
  } catch {
    /* ignore */
  }
  return new Set();
}

function saveFired(month: string, keys: Set<string>) {
  try {
    localStorage.setItem(FIRED_KEY, JSON.stringify({ month, keys: [...keys] }));
  } catch {
    /* best effort: worst case an alert shows once more */
  }
}

/**
 * In-app budget alerts (Settings > Notifications > Budget alerts).
 * When spending in a budgeted category reaches 80% and then 100% of this month's budget, one entry is
 * added to the notification bell, once per category, level and month. "Spent" is worked out exactly like
 * the Budget tab does it: this month's expense transactions grouped by budget category, for the active
 * household profile.
 */
export function useBudgetAlerts() {
  const enabled = useNotificationPreferencesStore((s) => s.prefs.budgetAlertsInApp);
  // Wait for the switch to be read from the cloud, so a device that has it off elsewhere never raises alerts
  // from its own default. Guests are device-only, so there is nothing to wait for.
  const hydrated = useNotificationPreferencesStore((s) => s.hydrated);
  const guest = useAuthStore((s) => (s.user as { isAnonymous?: boolean } | null)?.isAnonymous === true);
  const budgets = useBudgetStore((s) => s.items);
  const transactions = useTransactionsStore((s) => s.transactions);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);
  const addAlert = useAlertsStore((s) => s.add);
  const txConfirmed = useSyncStatusStore((s) => s.transactionsServerConfirmed);

  const month = getIstDateInfo().dateKey.slice(0, 7);

  const spentByCategory = useMemo(() => {
    const out = new Map<string, number>();
    for (const t of transactions) {
      if (t.type !== 'expense' || !t.date.startsWith(month)) continue;
      if (activeProfileId && t.profileId !== activeProfileId) continue;
      const key = budgetKey(t.category);
      if (!key) continue;
      out.set(key, (out.get(key) ?? 0) + t.amount);
    }
    return out;
  }, [transactions, activeProfileId, month]);

  useEffect(() => {
    if (!enabled || !txConfirmed || !(hydrated || guest)) return;
    const fired = loadFired(month);
    let changed = false;
    for (const item of budgets) {
      if (item.month !== month || !(item.amount > 0)) continue;
      const key = budgetKey(item.category);
      if (!key) continue;
      const spent = spentByCategory.get(key) ?? 0;
      const used = (spent / item.amount) * 100;
      const level = [...LEVELS].reverse().find((l) => used >= l);
      if (!level) continue;
      // Crossing 100% counts as having passed 80% as well, so the person isn't told twice at once.
      const marks = LEVELS.filter((l) => l <= level).map((l) => `${month}:${activeProfileId ?? 'all'}:${key}:${l}`);
      if (fired.has(marks[marks.length - 1])) continue; // this level was already announced
      marks.forEach((m) => fired.add(m));
      changed = true;
      const name = canonicalCategory(item.category);
      addAlert({
        // Same id on every device, so the alert shows once in each bell instead of repeating.
        id: marks[marks.length - 1],
        kind: 'budget',
        title: level >= 100 ? `${name} budget exceeded` : `${name} budget at ${Math.floor(used)}%`,
        body:
          level >= 100
            ? `Spent ${formatCurrency(spent)} of ${formatCurrency(item.amount)} this month (${formatCurrency(spent - item.amount)} over).`
            : `Spent ${formatCurrency(spent)} of ${formatCurrency(item.amount)} this month. ${formatCurrency(item.amount - spent)} left.`,
      });
    }
    if (changed) saveFired(month, fired);
  }, [enabled, hydrated, guest, txConfirmed, budgets, spentByCategory, month, activeProfileId, addAlert]);
}
