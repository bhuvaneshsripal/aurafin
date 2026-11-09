/**
 * Default profile pictures for demo (guest) accounts.
 *
 * A demo user has no Google photo and hasn't uploaded one, so instead of a
 * bare initial the app shows a friendly illustrated avatar. They're inline SVG
 * data URIs, so there's nothing to download, nothing for the service worker to
 * cache, and they work offline.
 *
 * The picture follows the gender saved in Settings > Basic details (see
 * `useUserGender` in hooks/useAvatarUrl.ts). Until a gender is set, demo users
 * get the male avatar.
 */

export type AvatarGender = 'male' | 'female' | 'other';

// Shared pieces (flat style, square canvas — the UI crops it to a circle).
const BG = `<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f3ec"/><stop offset="1" stop-color="#cde3d4"/></linearGradient></defs><rect width="128" height="128" fill="url(#bg)"/>`;
const EARS = `<circle cx="42" cy="58" r="4.5" fill="#d99f78"/><circle cx="86" cy="58" r="4.5" fill="#d99f78"/>`;
const NECK = `<path d="M54 74h20v26H54z" fill="#d9a07c"/><ellipse cx="64" cy="82" rx="12" ry="7" fill="#b9825f" opacity=".55"/>`;
const HEAD = `<ellipse cx="64" cy="56" rx="22" ry="26" fill="#e2ad88"/>`;
const NOSE = `<path d="M64 59c-1.6 5-1.6 7 1 7" stroke="#c48a65" stroke-width="1.8" fill="none" stroke-linecap="round"/>`;
const EYES = `<ellipse cx="56.5" cy="56" rx="2.3" ry="2.8" fill="#2b2320"/><ellipse cx="71.5" cy="56" rx="2.3" ry="2.8" fill="#2b2320"/>`;

/** T-shirt with a round neckline; `color` is the shirt colour. */
const shirt = (color: string) =>
  `<path d="M14 128C14 106 30 95 50 91C54 102 74 102 78 91C98 95 114 106 114 128Z" fill="${color}"/>`;

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${BG}${body}</svg>`;

const MALE = svg(
  [
    shirt('#2f4858'),
    NECK,
    EARS,
    HEAD,
    // short hair with a soft fringe
    `<path d="M41 56C37 34 50 22 64 22C79 22 91 34 87 56C85 48 82 42 78 38C70 42 56 42 50 38C46 42 43 48 41 56Z" fill="#2b2320"/>`,
    `<path d="M52 50q5-3 9 0M67 50q4-3 9 0" stroke="#2b2320" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
    EYES,
    NOSE,
    `<path d="M58 72q6 5 12 0" stroke="#9c5a4a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  ].join('')
);

const FEMALE = svg(
  [
    // long hair sits behind the shoulders and neck
    `<path d="M38 56C34 30 48 18 64 18C80 18 94 30 90 56C92 80 90 96 84 106L44 106C38 96 36 80 38 56Z" fill="#3a2a22"/>`,
    shirt('#d6455d'),
    NECK,
    EARS,
    HEAD,
    // side-swept fringe
    `<path d="M41 56C38 34 50 22 64 22C79 22 90 34 87 56C84 46 78 36 66 33C56 38 46 46 41 56Z" fill="#3a2a22"/>`,
    `<path d="M52 50q5-2.6 9 0M67 50q4-2.6 9 0" stroke="#3a2a22" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    EYES,
    `<path d="M53.6 54.6l-1.6-1.4M74.4 54.6l1.6-1.4" stroke="#2b2320" stroke-width="1.4" stroke-linecap="round"/>`,
    NOSE,
    `<path d="M58 72q6 5.4 12 0q-6 1.6-12 0z" fill="#b4505a" stroke="#b4505a" stroke-width="1.4" stroke-linejoin="round"/>`,
    `<circle cx="42" cy="64.5" r="1.9" fill="#e0b04a"/><circle cx="86" cy="64.5" r="1.9" fill="#e0b04a"/>`,
  ].join('')
);

const NEUTRAL = svg(
  [
    shirt('#3f6f64'),
    NECK,
    EARS,
    HEAD,
    // cropped, swept hair
    `<path d="M41 55C39 34 52 23 65 23C80 23 90 33 87 55C85 47 80 40 70 37C60 37 50 41 41 55Z" fill="#5a3b2a"/>`,
    `<path d="M52 50q5-2.8 9 0M67 50q4-2.8 9 0" stroke="#5a3b2a" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    EYES,
    NOSE,
    `<path d="M58 72q6 5 12 0" stroke="#9c5a4a" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
  ].join('')
);

const toDataUri = (markup: string) => `data:image/svg+xml;utf8,${encodeURIComponent(markup)}`;

const AVATARS: Record<AvatarGender, string> = {
  male: toDataUri(MALE),
  female: toDataUri(FEMALE),
  other: toDataUri(NEUTRAL),
};

/**
 * The demo profile picture for a gender. Anything unknown or not set yet
 * falls back to the male avatar (the current default).
 */
export function getDemoAvatar(gender?: AvatarGender | null): string {
  return AVATARS[gender ?? 'male'] ?? AVATARS.male;
}
