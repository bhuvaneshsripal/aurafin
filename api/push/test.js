// "Send me a test notification" for the signed-in person (Settings > Alerts when
// the app is closed). It also reports what is and isn't set up on the server,
// so a missing key or an unregistered phone shows up as a clear message
// instead of silence.
//
//   POST /api/push/test     Authorization: Bearer <Firebase ID token>
import '../_lib/quietDeprecations.js';
import webpush from 'web-push';
import { configureWebPush, initFirebaseAdmin } from '../_lib/pushEnv.js';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getApp } from 'firebase-admin/app';
import { runWeeklyDigest } from '../_lib/digest.js';
import { mailConfigured, sendMail } from '../_lib/mail.js';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// POST /api/push/test?resubscribe=1 is called by the service worker (public/notification-sw.js,
// "pushsubscriptionchange") when the browser rotates a device's push subscription while Aurafin is
// closed. The old address is only known to that device, so it proves ownership: the record holding it
// moves to the new address under the same account. (Kept in this file: Vercel's free plan allows
// only 12 serverless functions.)
const deviceId = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);
async function resubscribe(req, res) {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {};
    const oldEndpoint = String(body.oldEndpoint ?? '');
    const sub = body.subscription ?? {};
    const endpoint = String(sub.endpoint ?? '');
    const keys = sub.keys ?? {};
    if (!oldEndpoint || !/^https:\/\//i.test(endpoint) || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') {
      return res.status(400).json({ error: 'Bad request' });
    }
    initFirebaseAdmin();
    const snap = await getFirestore().collectionGroup('pushSubscriptions').get();
    const matches = snap.docs.filter((d) => d.data()?.endpoint === oldEndpoint);
    if (!matches.length) return res.status(404).json({ error: 'Unknown subscription' });
    for (const d of matches) {
      const old = d.data();
      await d.ref.parent.doc(deviceId(endpoint)).set(
        { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, expirationTime: sub.expirationTime ?? null, userAgent: old.userAgent ?? '', updatedAt: Date.now() },
        { merge: true }
      );
      if (d.ref.id !== deviceId(endpoint)) await d.ref.delete().catch(() => {});
    }
    return res.status(200).json({ ok: true, moved: matches.length });
  } catch (err) {
    console.error('push resubscribe failed', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}


// --- "Email me a link" resets: App Lock PIN and account password ------------------------------
// POST /api/push/test?pinreset=send|check|confirm    (App Lock PIN, page /reset-pin)
// POST /api/push/test?pwreset=send|check|confirm     (sign-in password, page /reset-password)
//   send     Authorization: Bearer <Firebase ID token>. Emails the signed-in account's own address a link
//            that is valid for 1 hour.
//   check    body { token }            -> is the link still good?
//   confirm  body { token, value }     -> saves the new PIN / password; the link is used up.
// The link works in any browser, signed in or not: the secret in it proves the person can read that
// mailbox. Only a keyed hash of it is stored (one doc per account, so a new email cancels the old link),
// in a top-level collection that Firestore rules do not open to clients (Admin SDK only).
const RESET_TTL_MS = 60 * 60_000;
const RESET_RESEND_MS = 60_000;
const RESET_KINDS = {
  pin: {
    query: 'pinreset',
    collection: 'pinResets',
    path: '/reset-pin',
    noun: 'PIN',
    button: 'Reset PIN',
    validate: (v) => (/^\d{4}$/.test(v) ? null : 'PIN must be exactly 4 digits.'),
    apply: async (db, uid, v) => {
      await db.collection('users').doc(uid).collection('meta').doc('appLock').set({ pin: v, enabled: true }, { merge: true });
    },
  },
  password: {
    query: 'pwreset',
    collection: 'pwResets',
    path: '/reset-password',
    noun: 'password',
    button: 'Reset Password',
    validate: (v) => (v.length >= 6 && v.length <= 128 ? null : 'Password must be at least 6 characters.'),
    // Also gives a Google-only account an email + password sign-in.
    apply: async (_db, uid, v) => {
      await getAuth().updateUser(uid, { password: v });
    },
  },
};
const tokenHash = (secret) =>
  createHmac('sha256', process.env.CRON_SECRET || process.env.VAPID_PRIVATE_KEY || 'aurafin').update(secret).digest('hex');
const maskEmail = (email) => {
  const [name = '', domain = ''] = String(email).split('@');
  return `${name.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(name.length - 1, 6)))}@${domain}`;
};
const escHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const appOrigin = (req) => {
  const env = String(process.env.APP_URL ?? '').trim().replace(/\/+$/, '');
  if (/^https?:\/\//i.test(env)) return env;
  const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
  return `https://${host}`;
};

function resetEmail(kind, link) {
  const { noun, button } = kind;
  const text = `Reset your ${noun}\n\nWe received a request to reset your ${noun}. Open this link to choose a new one (it expires in 1 hour):\n${link}\n\nIf you didn't request this, you can safely ignore this email. Your ${noun} won't change.\n\nAurafin - Know your true wealth at a glance\nQuestions? aurafinsupport@gmail.com`;
  const html = `<!doctype html><html><body style="margin:0;background:#ffffff">
<div style="max-width:600px;margin:0 auto;padding:56px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#171717">
  <div style="max-width:420px;margin:0 auto">
    <h1 style="margin:0 0 20px;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:700;color:#171717">Reset your ${noun}</h1>
    <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#525252">We received a request to reset your ${noun}. Click the button below to choose a new one. This link expires in 1 hour.</p>
    <a href="${escHtml(link)}" style="display:inline-block;background:#247a4d;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 26px;border-radius:4px">${button}</a>
    <p style="margin:36px 0 0;font-size:13px;line-height:1.6;color:#737373">If you didn't request this, you can safely ignore this email. Your ${noun} won't change.</p>
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px">
    <p style="margin:0;font-size:12px;line-height:1.6;color:#a3a3a3">Aurafin - Know your true wealth at a glance<br>Questions? <a href="mailto:aurafinsupport@gmail.com" style="color:#a3a3a3">aurafinsupport@gmail.com</a></p>
  </div>
</div></body></html>`;
  return { subject: `Reset your ${noun}`, text, html };
}

/** Finds the reset doc for a link's token and checks it. Returns { ref, uid } or null. */
async function validResetToken(db, kind, token) {
  const [uid, secret] = String(token ?? '').split('.');
  if (!uid || !secret || uid.length > 128) return null;
  const ref = db.collection(kind.collection).doc(uid);
  const data = (await ref.get()).data();
  if (!data || data.expiresAt < Date.now()) return null;
  const a = Buffer.from(tokenHash(secret));
  const b = Buffer.from(String(data.hash));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { ref, uid };
}

async function resetFlow(req, res, kind) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(200).json({ ok: false, error: 'The server is not set up yet (FIREBASE_SERVICE_ACCOUNT is missing on Vercel).' });
    initFirebaseAdmin();
    const db = getFirestore();
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {};
    const action = req.query[kind.query];

    if (action === 'check' || action === 'confirm') {
      const found = await validResetToken(db, kind, body.token);
      if (!found) return res.status(200).json({ ok: false, invalid: true, error: 'This link has expired or was already used. Go back to Aurafin and ask for a new one.' });
      if (action === 'check') return res.status(200).json({ ok: true });
      const value = String(body.value ?? '');
      const problem = kind.validate(value);
      if (problem) return res.status(200).json({ ok: false, error: problem });
      await kind.apply(db, found.uid, value);
      await found.ref.delete().catch(() => {});
      return res.status(200).json({ ok: true });
    }

    if (action === 'send') {
      if (!mailConfigured()) return res.status(200).json({ ok: false, error: 'Email is not set up on the server yet (add SMTP_USER and SMTP_PASS on Vercel, then redeploy).' });
      const idToken = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (!idToken) return res.status(401).json({ ok: false, error: 'Sign in first.' });
      const { uid } = await getAuth().verifyIdToken(idToken);
      const user = await getAuth().getUser(uid);
      if (!user.email) return res.status(200).json({ ok: false, error: 'This account has no email address, so a link cannot be sent.' });
      const ref = db.collection(kind.collection).doc(uid);
      const prev = (await ref.get()).data();
      const wait = prev?.sentAt ? RESET_RESEND_MS - (Date.now() - prev.sentAt) : 0;
      if (wait > 0 && prev.expiresAt > Date.now()) {
        // An email went out a moment ago: don't send another yet.
        return res.status(200).json({ ok: true, email: maskEmail(user.email), cooldown: Math.ceil(wait / 1000) });
      }
      const secret = randomBytes(24).toString('base64url');
      await ref.set({ hash: tokenHash(secret), expiresAt: Date.now() + RESET_TTL_MS, sentAt: Date.now() });
      try {
        await sendMail({ to: user.email, ...resetEmail(kind, `${appOrigin(req)}${kind.path}?token=${encodeURIComponent(`${uid}.${secret}`)}`) });
      } catch (err) {
        await ref.delete().catch(() => {});
        console.error(`${kind.query} mail failed`, String(err?.message ?? err).slice(0, 200));
        return res.status(200).json({ ok: false, error: 'Could not send the email. Please try again in a moment.' });
      }
      return res.status(200).json({ ok: true, email: maskEmail(user.email), cooldown: RESET_RESEND_MS / 1000 });
    }
    return res.status(400).json({ ok: false, error: 'Bad request' });
  } catch (err) {
    console.error(`${kind.query} failed`, String(err?.message ?? err).slice(0, 200));
    return res.status(500).json({ ok: false, error: 'Something went wrong. Please try again.' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.query?.resubscribe) return resubscribe(req, res);
  if (req.query?.pinreset) return resetFlow(req, res, RESET_KINDS.pin);
  if (req.query?.pwreset) return resetFlow(req, res, RESET_KINDS.password);

  // POST /api/push/test?digest=1  ->  emails the signed-in person their weekly digest right now.
  if (req.query?.digest) {
    try {
      if (!process.env.FIREBASE_SERVICE_ACCOUNT) return res.status(200).json({ ok: false, error: 'FIREBASE_SERVICE_ACCOUNT is not set on Vercel.' });
      if (!mailConfigured()) return res.status(200).json({ ok: false, error: 'Email is not set up on the server yet: add SMTP_USER and SMTP_PASS on Vercel and redeploy (see PUSH_SETUP.md).' });
      initFirebaseAdmin();
      const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
      if (!token) return res.status(401).json({ ok: false, error: 'Sign in first' });
      const { uid } = await getAuth().verifyIdToken(token);
      const out = await runWeeklyDigest(getFirestore(), { onlyUid: uid, test: true });
      const reason = Object.keys(out.skipped)[0];
      return res.status(200).json({ ok: out.sent > 0, sent: out.sent, error: out.errors[0]?.error ?? (out.sent ? undefined : reason) });
    } catch (err) {
      return res.status(500).json({ ok: false, error: String(err?.message ?? err) });
    }
  }
  const server = {
    vapid: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    serviceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    cronSecret: !!process.env.CRON_SECRET,
  };
  if (!server.vapid || !server.serviceAccount) return res.status(200).json({ ok: false, server, devices: 0, sent: 0 });

  try {
    initFirebaseAdmin();
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Sign in first' });
    const { uid } = await getAuth().verifyIdToken(token);

    configureWebPush();
    const snap = await getFirestore().collection('users').doc(uid).collection('pushSubscriptions').get();
    let sent = 0;
    let failed = 0;
    const errors = [];
    await Promise.all(
      snap.docs.map(async (d) => {
        const sub = d.data();
        if (!sub?.endpoint || !sub?.keys) return;
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            JSON.stringify({ title: 'Aurafin', body: 'Notifications work, even with the app closed.', tag: 'aurafin-test', url: '/', force: true }),
            { TTL: 3600, urgency: 'high' }
          );
          sent++;
        } catch (err) {
          failed++;
          errors.push({ status: err?.statusCode ?? null, body: String(err?.body ?? err?.message ?? err).slice(0, 300), host: (() => { try { return new URL(sub.endpoint).host; } catch { return ''; } })() });
          if (err?.statusCode === 404 || err?.statusCode === 410) await d.ref.delete().catch(() => {});
        }
      })
    );
    let projectId = '';
    try { projectId = String(getApp().options.projectId ?? ''); } catch { /* ignore */ }
    return res.status(200).json({ ok: sent > 0, server, devices: snap.size, sent, failed, errors, uid, projectId });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err), server });
  }
}
