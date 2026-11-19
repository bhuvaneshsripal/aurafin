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
import { mailConfigured } from '../_lib/mail.js';
import { createHash } from 'node:crypto';

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


export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  if (req.query?.resubscribe) return resubscribe(req, res);

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
