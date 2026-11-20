import { useEffect, useState } from 'react';

export interface WhatsNew {
  version?: string;
  date?: string;
  title?: string;
  items: { emoji?: string; title: string; description?: string }[];
}

/** Identity of a release-note item. Must match readKnownNotes() in vite.config.ts. */
const noteKey = (item: { title?: unknown }): string =>
  typeof item?.title === 'string' ? item.title.trim().toLowerCase() : '';

/** Loads /whats-new.json once, retrying a single time after a short pause so a
 *  network blip right as the update notice appears doesn't leave the list empty.
 *  Resolves to the parsed JSON, or null if it could not be read. */
async function fetchNotesFile(): Promise<unknown> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`/whats-new.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch {
      /* try again below */
    }
    if (attempt === 0) await new Promise((res) => window.setTimeout(res, 1500));
  }
  return null;
}

/** Fetches the release notes published with the newest deploy (/whats-new.json).
 *  The running (older) app can't know what the new build contains, so it asks
 *  the server — only once `enabled`, i.e. when an update is actually waiting.
 *
 *  The file keeps every release's items, so the list is first trimmed to what is
 *  NEW for this user: items already shipped in the running build
 *  (__KNOWN_NOTES__, baked in at build time) are dropped. Someone who skipped a
 *  few releases still sees everything added since their version.
 *
 *  If that leaves nothing (an update that only carries fixes, or a running build
 *  that already has every title in the file), the whole list is shown instead of
 *  an empty one — an update is waiting, so the dialog should still list what the
 *  release contains.
 *
 *  Resolves to null only if the file is missing/unreadable or has no valid items;
 *  the caller then shows a generic message instead of failing. */
export function useWhatsNew(enabled: boolean): WhatsNew | null {
  const [notes, setNotes] = useState<WhatsNew | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchNotesFile().then((raw) => {
      const json = raw as Partial<WhatsNew> | null;
      if (cancelled || !json || !Array.isArray(json.items)) return;
      // Keep only well-formed items with a unique, non-empty title.
      const seen = new Set<string>();
      const all = json.items.filter((i): i is WhatsNew['items'][number] => {
        const k = noteKey(i);
        if (k === '' || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (all.length === 0) return;
      const known = new Set<string>(typeof __KNOWN_NOTES__ !== 'undefined' ? __KNOWN_NOTES__ : []);
      const fresh = all.filter((i) => !known.has(noteKey(i)));
      setNotes({ ...json, items: fresh.length > 0 ? fresh : all });
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return notes;
}
