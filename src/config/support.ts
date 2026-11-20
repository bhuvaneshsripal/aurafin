/** Official Aurafin support inbox. Change it here and every Support button follows. */
export const SUPPORT_EMAIL = 'aurafinsupport@gmail.com';

const isPhone = () =>
  typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod|Mobi/i.test(navigator.userAgent);

/** Plain mailto: link (opens the phone's mail app / the computer's default mail app). */
export function supportMailto(subject = 'Aurafin support', body = ''): string {
  const q = `subject=${encodeURIComponent(subject)}${body ? `&body=${encodeURIComponent(body)}` : ''}`;
  return `mailto:${SUPPORT_EMAIL}?${q}`;
}

/** Gmail's web compose window, already addressed to support. */
export function supportGmailCompose(subject = 'Aurafin support', body = ''): string {
  const q = new URLSearchParams({ view: 'cm', fs: '1', to: SUPPORT_EMAIL, su: subject });
  if (body) q.set('body', body);
  return `https://mail.google.com/mail/?${q.toString()}`;
}

/**
 * Goes straight to a new email addressed to support.
 *  - Phones/tablets: mailto: (opens the Gmail / mail app compose screen).
 *  - Computers: Gmail's compose page in a new tab, because mailto: does nothing when no desktop
 *    mail app is set up (most people use Gmail in the browser).
 * Returns nothing; safe to call from any click handler.
 */
export function openSupportMail(subject?: string, body?: string): void {
  if (isPhone()) {
    window.location.href = supportMailto(subject, body);
    return;
  }
  const w = window.open(supportGmailCompose(subject, body), '_blank', 'noopener,noreferrer');
  // Pop-up blocked: fall back to mailto so the click still does something.
  if (!w) window.location.href = supportMailto(subject, body);
}

/** Short, non-sensitive context to pre-fill in a support email so replies are faster. */
export function supportContext(): string {
  const bits = [
    `App version: ${typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev'}`,
    `Page: ${typeof location !== 'undefined' ? location.pathname : ''}`,
    `Device: ${typeof navigator !== 'undefined' ? navigator.userAgent : ''}`,
  ];
  return `\n\n\n-----\nPlease write your message above this line.\n${bits.join('\n')}`;
}
