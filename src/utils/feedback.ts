/**
 * In-app feedback. Every message is
 *   1. SAVED to Firestore, in the top-level `feedback` collection (this is
 *      where you read it: Firebase console > Firestore Database > feedback),
 *   2. and, if EmailJS is configured, also EMAILED to the owner's inbox.
 * Sending counts as successful when at least one of the two worked.
 *
 * Each saved document holds: message, name, email, uid, isGuest, page,
 * createdAt (server time), appVersion-free device info (userAgent, screen),
 * and status ("new") so you can mark it "done" in the console.
 *
 * The Firestore rule that allows this lives in firestore.rules (users may
 * create their own feedback but never read or change anyone's).
 *
 * Optional email: create an EmailJS template with {{message}}, {{from_name}},
 * {{from_email}} and {{page}}, set its "To Email" to your address, and put
 * its ID in VITE_EMAILJS_FEEDBACK_TEMPLATE_ID.
 */
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID as string | undefined;
const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_FEEDBACK_TEMPLATE_ID as string | undefined;
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY as string | undefined;
const FIREBASE_PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined;

function emailConfigured(): boolean {
  return Boolean(SERVICE_ID && TEMPLATE_ID && PUBLIC_KEY);
}

/** Feedback works as soon as Firebase is set up (email is a bonus). */
export function isFeedbackConfigured(): boolean {
  return Boolean(FIREBASE_PROJECT) || emailConfigured();
}

async function saveToFirestore(p: FeedbackParams) {
  if (!p.uid) throw new Error('not signed in');
  await addDoc(collection(db, 'feedback'), {
    message: p.message,
    rating: p.rating,
    category: p.category,
    ...(p.attachment ? { attachment: p.attachment } : {}),
    name: p.fromName || 'Aurafin user',
    email: p.fromEmail || '',
    uid: p.uid,
    isGuest: !!p.isGuest,
    page: typeof window !== 'undefined' ? window.location.pathname : '',
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    screen: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : '',
    status: 'new',
    createdAt: serverTimestamp(),
  });
}

/** Public, trimmed-down copy shown on the login page: first name, rating and
 *  message only (never email, uid or device info). The private `feedback`
 *  document above is untouched and stays the full record. */
async function saveReview(p: FeedbackParams) {
  if (!p.uid) throw new Error('not signed in');
  const first = (p.fromName || '').trim().split(/\s+/)[0];
  await addDoc(collection(db, 'reviews'), {
    name: (first || (p.isGuest ? 'Guest' : 'Aurafin member')).slice(0, 40),
    rating: p.rating,
    message: p.message.length > 400 ? `${p.message.slice(0, 397)}...` : p.message,
    createdAt: serverTimestamp(),
  });
}

async function sendEmail(p: FeedbackParams) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: TEMPLATE_ID,
      user_id: PUBLIC_KEY,
      template_params: {
        message: p.message,
        rating: `${p.rating}/5`,
        category: p.category,
        from_name: p.fromName || 'Aurafin user',
        from_email: p.fromEmail || 'not available',
        page: typeof window !== 'undefined' ? window.location.pathname : '',
      },
    }),
  });
  if (!res.ok) throw new Error('email failed');
}

export type FeedbackCategory = 'bug' | 'feature' | 'other';
export interface FeedbackAttachment { name: string; type: string; dataUrl: string }

export interface FeedbackParams {
  category: FeedbackCategory;
  attachment?: FeedbackAttachment;
  message: string;
  rating: number; // 1-5
  fromName: string;
  fromEmail: string;
  uid?: string;
  isGuest?: boolean;
}

export async function sendFeedback(params: FeedbackParams) {
  const jobs: Promise<unknown>[] = [saveToFirestore(params)];
  // Best-effort public review; its failure never fails the feedback itself.
  void saveReview(params).catch((e) => console.warn('Could not publish review', e));
  if (emailConfigured()) jobs.push(sendEmail(params));
  const results = await Promise.allSettled(jobs);
  if (results.every((r) => r.status === 'rejected')) {
    console.error('Feedback could not be sent', results);
    throw new Error('Could not send your feedback. Please check your connection and try again.');
  }
}
