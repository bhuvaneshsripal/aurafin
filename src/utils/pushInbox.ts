import { useAlertsStore, type AlertKind } from '../store/alertsStore';

/**
 * Notifications the server pushed while Aurafin was closed or in the
 * background are shown by the service worker (public/notification-sw.js) in the
 * phone's notification bar — and nothing else. The worker also saves a copy to
 * this IndexedDB inbox; here the app files them into the Notifications list so
 * everything seen in the notification bar is in the list too.
 */
const DB = 'aurafin-inbox';
const STORE = 'pushes';

interface InboxItem {
  title: string;
  body: string;
  tag: string;
  at: number;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { autoIncrement: true });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Reads and empties the inbox. */
async function takeAll(): Promise<InboxItem[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      let items: InboxItem[] = [];
      req.onsuccess = () => {
        items = req.result as InboxItem[];
        store.clear();
      };
      tx.oncomplete = () => { db.close(); resolve(items); };
      tx.onerror = () => { db.close(); resolve([]); };
    } catch {
      resolve([]);
    }
  });
}

const INDEX_KEYS = ['nifty', 'sensex', 'banknifty'];
const SESSION_TITLE: Record<string, { kind: AlertKind; title: string }> = {
  pre: { kind: 'pre-open', title: 'Pre-market started' },
  open: { kind: 'open', title: 'Market opened' },
  close: { kind: 'close', title: 'Market closed' },
};

let draining = false;

/** Adds every pushed alert the list doesn't already have. Safe to call often. */
export async function drainPushInbox(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    const items = (await takeAll()).sort((a, b) => a.at - b.at);
    if (!items.length) return;
    const store = useAlertsStore.getState();

    // Tags look like "2026-11-02:pre:0" (one push per index; the app lists them
    // as ONE summary) or "2026-11-02:TCS:up2" / "2026-11-02:nifty:down2" (one
    // push = one alert). The key without the part number is the same key the
    // app's own live alerts use, so anything the app already raised is skipped.
    const groups = new Map<string, InboxItem[]>();
    for (const it of items) {
      const [day, a, b] = it.tag.split(':');
      if (!day || !a) continue;
      const isSession = a in SESSION_TITLE;
      const key = isSession ? `${day}:${a}` : `${day}:${a}:${b ?? ''}`;
      groups.set(key, [...(groups.get(key) ?? []), it]);
    }

    for (const [key, list] of groups) {
      if (useAlertsStore.getState().fired[key]) continue;
      const [day, a, b] = key.split(':');
      useAlertsStore.getState().markFired(key, day);
      const at = list[0].at;
      const session = SESSION_TITLE[a];
      if (session) {
        // "NIFTY Pre-market" + "23,053.10 (+0.51%)" -> "NIFTY 23,053.10 (+0.51%)"
        const body = list.map((p) => `${p.title.split(' ')[0]} ${p.body}`).join(' · ');
        store.add({ kind: session.kind, title: session.title, body, at });
      } else {
        const kind: AlertKind = INDEX_KEYS.includes(a) ? 'market' : b?.startsWith('down') ? 'down' : 'up';
        store.add({ kind, title: list[0].title, body: list[0].body, at });
      }
    }
  } finally {
    draining = false;
  }
}
