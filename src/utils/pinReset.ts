// "Email me a link" resets for the App Lock PIN and the account password: the server emails the signed-in
// account's own address a link that opens /reset-pin or /reset-password. See api/push/test.js.

export type ResetKind = 'pin' | 'password';
const QUERY: Record<ResetKind, string> = { pin: 'pinreset', password: 'pwreset' };

interface ApiReply {
  ok?: boolean;
  error?: string;
  email?: string;
  cooldown?: number;
  invalid?: boolean;
}

async function call(kind: ResetKind, action: 'send' | 'check' | 'confirm', body?: object, signedIn = false): Promise<ApiReply> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (signedIn) {
      const { auth } = await import('../firebase/config');
      const token = await auth.currentUser?.getIdToken();
      if (!token) return { ok: false, error: 'Please sign in again.' };
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await fetch(`/api/push/test?${QUERY[kind]}=${action}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
    const data = (await res.json().catch(() => null)) as ApiReply | null;
    if (data) return data;
    return { ok: false, error: res.status === 404 ? 'This is not available on this deployment yet.' : 'The server could not be reached. Please try again.' };
  } catch {
    return { ok: false, error: 'Low network connectivity. Please check your internet and try again.' };
  }
}

/** Emails the reset link. `email` is masked (e.g. "a***@gmail.com"); `cooldown` = seconds until a resend is allowed. */
export const sendResetLink = (kind: ResetKind) => call(kind, 'send', undefined, true);
/** Is the link from the email still valid? (no sign-in needed) */
export const checkResetToken = (kind: ResetKind, token: string) => call(kind, 'check', { token });
/** Saves the new PIN / password using the link's token. */
export const confirmReset = (kind: ResetKind, token: string, value: string) => call(kind, 'confirm', { token, value });

export const sendPinResetLink = () => sendResetLink('pin');
