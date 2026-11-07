// Reads and cleans the push-related environment variables so common copy/paste
// mistakes in the Vercel dashboard don't turn into an opaque 500:
//  - stray quotes / spaces / newlines around values
//  - VAPID keys pasted with "=" padding or standard-base64 characters
//  - VAPID_SUBJECT given without "mailto:"
//  - service-account JSON wrapped in quotes, or pasted as base64
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import webpush from 'web-push';

const clean = (v) => String(v ?? '').trim().replace(/^(['"`])([\s\S]*)\1$/, '$2').trim();
const urlSafe = (v) => clean(v).replace(/\s+/g, '').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function vapidDetails() {
  let subject = clean(process.env.VAPID_SUBJECT) || 'mailto:admin@example.com';
  if (!/^(mailto:|https?:\/\/)/i.test(subject)) subject = `mailto:${subject}`;
  return [subject, urlSafe(process.env.VAPID_PUBLIC_KEY), urlSafe(process.env.VAPID_PRIVATE_KEY)];
}

export function configureWebPush() {
  try {
    webpush.setVapidDetails(...vapidDetails());
  } catch (err) {
    throw new Error(`VAPID setup failed: ${err?.message ?? err}. Check VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (from "npx web-push generate-vapid-keys") and VAPID_SUBJECT.`);
  }
  return webpush;
}

function parseServiceAccount(raw) {
  let text = clean(raw);
  if (!text.startsWith('{')) {
    try { text = Buffer.from(text, 'base64').toString('utf8').trim(); } catch { /* fall through */ }
  }
  try {
    return JSON.parse(text);
  } catch {
    // Real newlines inside the private key (a multi-line paste) break JSON.parse.
    try { return JSON.parse(text.replace(/\r?\n/g, '\\n')); } catch { /* fall through */ }
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON. Paste the whole downloaded service-account file, unchanged.');
  }
}

export function initFirebaseAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!clean(raw)) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  const account = parseServiceAccount(raw);
  if (typeof account.private_key === 'string') account.private_key = account.private_key.replace(/\\n/g, '\n');
  try {
    initializeApp({ credential: cert(account) });
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is not a valid service account: ${err?.message ?? err}`);
  }
}
