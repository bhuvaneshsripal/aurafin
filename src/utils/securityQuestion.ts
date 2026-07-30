import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

// Recovery for the email/password sign-in password (Settings → Set
// Password). Not related to the App Lock PIN, which has its own OTP-based
// reset (see utils/otp.ts).

export const SECURITY_QUESTIONS = [
  "What is your mother's maiden name?",
  'What was the name of your first school?',
  'What was your first pet\u2019s name?',
  'What city were you born in?',
  'What was your favorite teacher\u2019s name?',
  'What was the name of your first college?',
] as const;

interface SecurityAnswerDoc {
  id: string;
  question: string;
  answerHash: string;
  updatedAt: number;
}

function normalize(answer: string) {
  return answer.trim().toLowerCase();
}

async function hash(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function docRef(uid: string) {
  return doc(db, 'users', uid, 'security', 'passwordRecovery');
}

/** Saves (or overwrites) the security question + answer used to recover the
 *  sign-in password. The answer itself is never stored — only its hash. */
export async function saveSecurityAnswer(uid: string, question: string, answer: string) {
  const answerHash = await hash(normalize(answer));
  const data: SecurityAnswerDoc = { id: 'passwordRecovery', question, answerHash, updatedAt: Date.now() };
  await setDoc(docRef(uid), data);
}

/** Returns the previously-chosen question (not the answer) so it can be
 *  displayed on the "Forgot password?" screen, or null if none is set up. */
export async function getSecurityQuestion(uid: string): Promise<string | null> {
  const snap = await getDoc(docRef(uid));
  if (!snap.exists()) return null;
  return (snap.data() as SecurityAnswerDoc).question;
}

export async function verifySecurityAnswer(uid: string, answer: string): Promise<boolean> {
  const snap = await getDoc(docRef(uid));
  if (!snap.exists()) return false;
  const stored = snap.data() as SecurityAnswerDoc;
  const candidateHash = await hash(normalize(answer));
  return candidateHash === stored.answerHash;
}
