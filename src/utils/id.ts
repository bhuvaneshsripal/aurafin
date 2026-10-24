/**
 * Unique id for a new record.
 *
 * `crypto.randomUUID()` only exists in secure contexts (https or localhost) and in fairly recent
 * browsers — on a plain-http address or an older phone it throws, which made every "Add" button
 * silently do nothing. This falls back to `getRandomValues`, then to `Math.random`.
 */
export function newId(): string {
  const c = typeof globalThis !== 'undefined' ? (globalThis as { crypto?: Crypto }).crypto : undefined;
  try {
    if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  } catch {
    /* fall through */
  }
  const bytes = new Uint8Array(16);
  try {
    if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes);
    else throw new Error('no crypto');
  } catch {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}
