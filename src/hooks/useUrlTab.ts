import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Keeps a simple string-union "tab" (or step) state in sync with a URL
 * search param so that:
 *  - Refreshing the page keeps you on the same tab/step instead of resetting
 *    to the default.
 *  - The browser Back button steps back one tab/step change at a time
 *    instead of leaving the whole page.
 *
 * The very first sync (writing the starting value into the URL on load)
 * replaces the history entry rather than pushing one, so it doesn't add an
 * extra Back stop before the page had even finished loading.
 */
export function useUrlTab<T extends string>(
  validValues: readonly T[],
  defaultValue: T,
  paramKey = 'tab'
): [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const fromUrl = searchParams.get(paramKey) as T | null;
  const initial = fromUrl && validValues.includes(fromUrl) ? fromUrl : defaultValue;
  const [value, setValue] = useState<T>(initial);
  const didMountRef = useRef(false);

  // Local state -> URL.
  useEffect(() => {
    if (searchParams.get(paramKey) !== value) {
      const next = new URLSearchParams(searchParams);
      next.set(paramKey, value);
      setSearchParams(next, { replace: !didMountRef.current });
    }
    didMountRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // URL -> local state (covers Back/Forward navigation, manual refresh, and
  // re-clicking a nav link back to this page — which lands on the bare path
  // with no ?tab= param and should snap back to the default tab).
  useEffect(() => {
    const urlValue = searchParams.get(paramKey) as T | null;
    const resolved = urlValue && validValues.includes(urlValue) ? urlValue : defaultValue;
    if (resolved !== value) {
      setValue(resolved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  return [value, setValue];
}
