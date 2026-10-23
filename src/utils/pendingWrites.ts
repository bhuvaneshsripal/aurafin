/**
 * Journal of saves that haven't been confirmed by Firestore yet.
 *
 * `setDoc()` only resolves once the server acknowledges the write. If the page
 * is refreshed (or the connection drops) before that, the edit may not have
 * reached Firestore's own offline queue, and the stale cached/server copy then
 * "reverts" what you just typed. So every save is written here synchronously
 * (localStorage) *before* it is sent, removed once Firestore confirms it, and
 * re-applied on top of whatever the next snapshot says and re-sent on startup.
 */
type Op = 'set' | 'del';

interface Pending {
  col: string;
  id: string;
  op: Op;
  /** JSON-safe copy of the item (undefined values are listed in `cleared`). */
  item?: Record<string, unknown>;
  /** Fields the form explicitly cleared (value `undefined`). */
  cleared?: string[];
  at: number;
}

const key = (uid: string) => `aurafin-pending-${uid}`;
const slot = (col: string, id: string) => `${col}/${id}`;

function readAll(uid: string): Record<string, Pending> {
  try {
    const raw = localStorage.getItem(key(uid));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(uid: string, all: Record<string, Pending>) {
  try {
    if (Object.keys(all).length === 0) localStorage.removeItem(key(uid));
    else localStorage.setItem(key(uid), JSON.stringify(all));
  } catch {
    /* storage full/blocked: Firestore's own queue is still the fallback */
  }
}

function split(item: Record<string, unknown>) {
  const clean: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const [k, v] of Object.entries(item)) {
    if (v === undefined) cleared.push(k);
    else clean[k] = v;
  }
  return { clean, cleared };
}

/** Records a save/delete; returns a token to pass to `confirmPending`. */
export function recordPending(uid: string, col: string, id: string, op: Op, item?: Record<string, unknown>): number {
  const all = readAll(uid);
  const at = Date.now() + Math.random(); // unique even within one millisecond
  if (op === 'del') {
    all[slot(col, id)] = { col, id, op, at };
  } else {
    const prev = all[slot(col, id)];
    const { clean, cleared } = split(item ?? {});
    // A later save merges over an earlier unconfirmed one for the same doc.
    const base = prev && prev.op === 'set' ? prev : undefined;
    const merged = { ...(base?.item ?? {}), ...clean };
    const mergedCleared = new Set([...(base?.cleared ?? []), ...cleared]);
    for (const k of Object.keys(clean)) mergedCleared.delete(k);
    all[slot(col, id)] = { col, id, op, item: merged, cleared: [...mergedCleared], at };
  }
  writeAll(uid, all);
  return at;
}

/** Firestore acknowledged the write: drop it, unless a newer save replaced it. */
export function confirmPending(uid: string, col: string, id: string, at: number) {
  const all = readAll(uid);
  if (all[slot(col, id)]?.at === at) {
    delete all[slot(col, id)];
    writeAll(uid, all);
  }
}

export function pendingFor(uid: string, col: string): Pending[] {
  return Object.values(readAll(uid)).filter((p) => p.col === col);
}

/** Lays unconfirmed saves/deletes over a list coming from the cache/server. */
export function applyPending<T extends { id: string }>(uid: string, col: string, items: T[]): T[] {
  const list = pendingFor(uid, col);
  if (list.length === 0) return items;
  let out = items;
  for (const p of list) {
    if (p.op === 'del') {
      out = out.filter((i) => i.id !== p.id);
      continue;
    }
    const patch = p.item as Record<string, unknown>;
    const exists = out.some((i) => i.id === p.id);
    const apply = (base: Record<string, unknown>) => {
      const m = { ...base, ...patch };
      for (const c of p.cleared ?? []) delete m[c];
      return m as unknown as T;
    };
    out = exists ? out.map((i) => (i.id === p.id ? apply(i as Record<string, unknown>) : i)) : [...out, apply({ id: p.id })];
  }
  return out;
}

/** Rebuilds the item to re-send, with cleared fields as `undefined` again. */
export function pendingItem(p: Pending): Record<string, unknown> {
  const item: Record<string, unknown> = { ...(p.item ?? {}), id: p.id };
  for (const c of p.cleared ?? []) item[c] = undefined;
  return item;
}
