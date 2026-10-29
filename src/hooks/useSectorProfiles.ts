import { useEffect, useMemo, useState } from 'react';
import type { Asset } from '../types';
import { useSectorProfilesStore } from '../store/sectorProfilesStore';
import { needsProfileLookup, normaliseSymbol, profileKey, type SectorProfile } from '../utils/sectors';

const MISS_RETRY_MS = 3 * 24 * 60 * 60 * 1000; // retry "nothing found" after 3 days
const BATCH = 25;

/**
 * Makes sure every single-stock holding that isn't in the built-in symbol map
 * has a cached company profile (sector + industry). Returns the cache and
 * whether a lookup is still running.
 */
export function useSectorProfiles(assets: Asset[]) {
  const profiles = useSectorProfilesStore((s) => s.profiles);
  const fetchedAt = useSectorProfilesStore((s) => s.fetchedAt);
  const setProfiles = useSectorProfilesStore((s) => s.setProfiles);
  const [loading, setLoading] = useState(false);

  // key -> { market, symbol } still to look up
  const missing = useMemo(() => {
    const out = new Map<string, { market: 'IN' | 'US'; symbol: string }>();
    const now = Date.now();
    for (const a of assets) {
      if (!needsProfileLookup(a)) continue;
      const key = profileKey(a);
      const known = profiles[key];
      const at = fetchedAt[key];
      if (known) continue;
      if (known === null && at !== undefined && now - at < MISS_RETRY_MS) continue;
      out.set(key, { market: key.startsWith('US:') ? 'US' : 'IN', symbol: normaliseSymbol(a.symbol) });
    }
    return out;
  }, [assets, profiles, fetchedAt]);

  const signature = useMemo(() => [...missing.keys()].sort().join('|'), [missing]);

  useEffect(() => {
    if (missing.size === 0) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      for (const market of ['IN', 'US'] as const) {
        const entries = [...missing.entries()].filter(([, v]) => v.market === market);
        for (let i = 0; i < entries.length; i += BATCH) {
          const chunk = entries.slice(i, i + BATCH);
          try {
            const res = await fetch(
              `/api/market/sector?market=${market}&symbols=${encodeURIComponent(chunk.map(([, v]) => v.symbol).join(','))}`
            );
            if (!res.ok) continue; // leave uncached → retried next visit
            const data = (await res.json()) as Record<string, SectorProfile | null>;
            if (cancelled) return;
            const batch: Record<string, SectorProfile | null> = {};
            for (const [key, v] of chunk) batch[key] = data[v.symbol] ?? null;
            setProfiles(batch);
          } catch {
            /* offline / upstream down: stays "Unclassified" until a later visit */
          }
        }
      }
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
      setLoading(false);
    };
    // `signature` captures exactly which symbols are missing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, setProfiles]);

  return { profiles, loading };
}
