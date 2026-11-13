/**
 * Access password asked every single time someone taps Login, Sign up or
 * Try demo. Nothing is remembered: going back and trying again asks again.
 *
 * Always lowercase: whatever is typed is trimmed and lowercased before it is
 * compared, so phone keyboards that capitalise the first letter still work.
 *
 * NOTE: this runs in the browser, so it is a soft gate (it keeps casual
 * visitors out of the login flow) and not real security. Anyone who reads the
 * built JavaScript can find it. Real protection has to be enforced server-side
 * (e.g. Firebase Auth / Firestore rules).
 */
export const ACCESS_PASSWORD = 'aurafinbybhuvanesh';

export function checkAccessPassword(input: string): boolean {
  return input.trim().toLowerCase() === ACCESS_PASSWORD;
}
