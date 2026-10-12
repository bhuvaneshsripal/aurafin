/** Last-known copy of each collection, kept in localStorage so that on a
 *  weak/no connection the app can show what you saw last time instead of an
 *  empty "no data yet" screen (Firestore's own offline cache can be slow to
 *  answer, or come back empty, before the network gives up). */
const BACKUP_PREFIX = 'aurafin-last-';
const backupKey = (uid: string, collectionName: string) => `${BACKUP_PREFIX}${uid}-${collectionName}`;

export function readBackup<T>(uid: string, collectionName: string): T[] | null {
  try {
    const raw = localStorage.getItem(backupKey(uid, collectionName));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : null;
  } catch {
    return null;
  }
}

export function writeBackup<T>(uid: string, collectionName: string, items: T[]) {
  try {
    if (items.length === 0) localStorage.removeItem(backupKey(uid, collectionName));
    else localStorage.setItem(backupKey(uid, collectionName), JSON.stringify(items));
  } catch {
    // Quota exceeded / storage blocked: we just lose the offline fallback.
  }
}

/** Removes every saved last-known copy (called on logout). */
export function clearDataBackups() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(BACKUP_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}
