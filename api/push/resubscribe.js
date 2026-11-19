// Called by the service worker (public/notification-sw.js, "pushsubscriptionchange") when the
// browser rotates a device's push subscription while Aurafin is closed. The old address is only
// known to that device, so it is the proof of ownership: the record holding it is moved to the
// new address, under the same person's account. No sign-in is possible from a closed app.
//
//   POST /api/push/resubscribe   { oldEndpoint, subscription: { endpoint, keys: { p256dh, auth } } }
import '../_lib/quietDeprecations.js';
import { createHash } from 'node:crypto';
import { getFirestore } from 'firebase-admin/firestore';
import { initFirebaseAdmin } from '../_lib/pushEnv.js';

const deviceId = (endpoint) => createHash('sha256').update(endpoint).digest('hex').slice(0, 32);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
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
    const db = getFirestore();
    const snap = await db.collectionGroup('pushSubscriptions').get();
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
