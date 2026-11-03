// Firebase Auth throws errors whose `.message` is an internal, developer-facing
// string like `Firebase: Error (auth/wrong-password).` — fine for a console
// log, not something to show a person trying to log in. This maps the stable
// `.code` field (present on every Firebase Auth error) to plain, professional
// copy, and only falls back to a generic message for anything unrecognized.
const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That email address doesn\u2019t look right. Please check it and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact support if you think that\u2019s a mistake.',
  'auth/user-not-found': 'We couldn\u2019t find an account with that email. Check the address or sign up instead.',
  'auth/wrong-password': 'That password doesn\u2019t match this account. Please try again.',
  'auth/invalid-credential': 'That email or password doesn\u2019t match our records. Please check and try again.',
  'auth/invalid-login-credentials': 'That email or password doesn\u2019t match our records. Please check and try again.',
  'auth/missing-password': 'Please enter your password.',
  'auth/email-already-in-use': 'An account with that email already exists. Try logging in instead.',
  'auth/weak-password': 'Please choose a stronger password (at least 6 characters).',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network error. Please check your connection and try again.',
  'auth/operation-not-allowed': 'This sign-in method isn\u2019t enabled right now. Please try another option.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Please allow popups for this site and try again.',
  'auth/unauthorized-domain': 'Sign-in isn\u2019t available from this domain yet. Please try again later.',
  'auth/admin-restricted-operation': 'Guest sign-in is switched off for this app. The owner needs to enable Anonymous sign-in in Firebase.',
  'auth/invalid-api-key': 'This app isn\u2019t connected to its sign-in service yet (missing Firebase settings). Please try again later.',
  'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'This app isn\u2019t connected to its sign-in service yet (missing Firebase settings). Please try again later.',
  'auth/configuration-not-found': 'Sign-in isn\u2019t set up for this app yet. The owner needs to finish the Firebase Authentication setup.',
  'auth/account-exists-with-different-credential': 'An account with this email already exists with a different sign-in method. Please use the method you signed up with (Google, Apple, Microsoft, Yahoo or email).',
  'auth/internal-error': 'Something went wrong on our end. Please try again.',
};

/** Extracts a Firebase Auth-style `code` (e.g. "auth/wrong-password") off an
 *  unknown thrown value, if present. */
function getAuthErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') return code;
  }
  return undefined;
}

/** Turns any error thrown by a Firebase Auth call into a short, professional
 *  message safe to show directly in the UI. Pass a context-specific
 *  `fallback` for errors this map doesn't recognize. */
export function friendlyAuthError(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const code = getAuthErrorCode(error);
  if (code && AUTH_ERROR_MESSAGES[code]) return AUTH_ERROR_MESSAGES[code];
  return fallback;
}
