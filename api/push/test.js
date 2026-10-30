// "Send me a test notification" for the signed-in person (Settings > Alerts when
// the app is closed). It also reports what is and isn't set up on the server,
// so a missing key or an unregistered phone shows up as a clear message
// instead of silence.
//
//   POST /api/push/test     Authorization: Bearer <Firebase ID token>
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

function init() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    const account = JSON.parse(raw);
    if (typeof account.private_key === 'string') account.private_key = account.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(account) });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const server = {
    vapid: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    serviceAccount: !!process.env.FIREBASE_SERVICE_ACCOUNT,
    cronSecret: !!process.env.CRON_SECRET,
  };
  if (!server.vapid || !server.serviceAccount) return res.status(200).json({ ok: false, server, devices: 0, sent: 0 });

  try {
    init();
    const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'Sign in first' });
    const { uid } = await getAuth().verifyIdToken(token);

    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const snap = await getFirestore().collection('users').doc(uid).collection('pushSubscriptions').get();
    let sent = 0;
    let failed = 0;
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
          if (err?.statusCode === 404 || err?.statusCode === 410) await d.ref.delete().catch(() => {});
        }
      })
    );
    return res.status(200).json({ ok: sent > 0, server, devices: snap.size, sent, failed });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message ?? err), server });
  }
}
