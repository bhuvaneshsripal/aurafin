// Sends Aurafin's market / holding alerts as real Web Push messages, so they
// reach phones and laptops even when the app is closed.
//
// A scheduler (see .github/workflows/push-alerts.yml) calls this every few
// minutes on weekdays. It is protected by CRON_SECRET and is safe to call
// often: every alert is claimed in Firestore first, so it goes out once a day.
//
//   GET /api/push/send            normal run
//   GET /api/push/send?test=1     sends a "Push is working" message to every device
//
// Needs these environment variables (see PUSH_SETUP.md):
//   FIREBASE_SERVICE_ACCOUNT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
//   VAPID_SUBJECT, CRON_SECRET
import { createHash } from 'node:crypto';
import webpush from 'web-push';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fetchIndices } from '../_lib/indices.js';
import { resolveQuote } from '../_lib/quote.js';

export const config = { maxDuration: 60 };

const MOVE_LEVELS = [2, 5];
const INDEX_KEYS = ['nifty', 'sensex', 'banknifty'];

// Same session windows as the in-app alerts (minutes since midnight, IST).
const PRE_OPEN = [9 * 60, 9 * 60 + 15];
const OPEN = [9 * 60 + 15, 9 * 60 + 45];
const CLOSE = [15 * 60 + 30, 17 * 60];
const MARKET_HOURS = [9 * 60 + 15, 15 * 60 + 30];

const fmt = (n) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = (n, currency = 'INR') => {
  try {
    return n.toLocaleString(currency === 'USD' ? 'en-US' : 'en-IN', { style: 'currency', currency });
  } catch {
    return fmt(n);
  }
};

function istNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23',
    }).formatToParts(new Date()).map((p) => [p.type, p.value])
  );
  const weekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) + 1;
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    weekday,
    mins: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function getDb() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
    const account = JSON.parse(raw);
    if (typeof account.private_key === 'string') account.private_key = account.private_key.replace(/\\n/g, '\n');
    initializeApp({ credential: cert(account) });
  }
  return getFirestore();
}

/** Atomically marks `keys` as sent for the day; returns only the ones this run won. */
async function claim(db, ref, dateKey, keys) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const fired = data.day === dateKey ? data.fired ?? {} : {};
    const won = keys.filter((k) => !fired[k]);
    if (won.length) {
      won.forEach((k) => (fired[k] = true));
      tx.set(ref, { day: dateKey, fired });
    }
    return won;
  });
}

async function pushTo(subs, payload) {
  let sent = 0;
  await Promise.all(
    subs.map(async ({ ref, sub }) => {
      try {
        // TTL: the push service holds the message for a phone that is off or
        // offline and hands it over the moment the phone reconnects (an hour
        // was too short: a phone offline over lunch missed everything).
        // Topic: a newer message with the same tag replaces an older one that
        // is still waiting, so a reconnecting phone gets the latest, not a pile.
        const topic = payload.tag ? createHash('sha1').update(String(payload.tag)).digest('base64url').slice(0, 32) : undefined;
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: payload.ttl ?? 6 * 3600, urgency: 'high', ...(topic ? { topic } : {}) });
        sent++;
      } catch (err) {
        // The device unsubscribed / the browser dropped it: forget it.
        if (err?.statusCode === 404 || err?.statusCode === 410) await ref.delete().catch(() => {});
      }
    })
  );
  return sent;
}

/** One notification per part, in order. */
async function pushParts(subs, parts, baseTag) {
  let sent = 0;
  for (let n = 0; n < parts.length; n++) {
    sent += await pushTo(subs, { ...parts[n], tag: `${baseTag}:${n}`, url: '/' });
    if (n < parts.length - 1) await new Promise((r) => setTimeout(r, 300));
  }
  return sent;
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return res.status(500).json({ error: 'CRON_SECRET is not set' });
  if (req.headers.authorization !== `Bearer ${secret}`) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return res.status(500).json({ error: 'VAPID keys are not set' });
  }

  try {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    const db = getDb();

    const snap = await db.collectionGroup('pushSubscriptions').get();
    const byUser = new Map();
    snap.forEach((d) => {
      const sub = d.data();
      if (!sub?.endpoint || !sub?.keys) return;
      const uid = d.ref.parent.parent.id;
      const list = byUser.get(uid) ?? [];
      list.push({ ref: d.ref, sub: { endpoint: sub.endpoint, keys: sub.keys } });
      byUser.set(uid, list);
    });
    const everyone = [...byUser.values()].flat();
    const summary = { devices: everyone.length, users: byUser.size, sent: 0, skipped: null };

    if (req.query?.test) {
      summary.sent = await pushTo(everyone, {
        title: 'Aurafin',
        body: 'Push notifications are working, even with the app closed.',
        tag: 'aurafin-test',
        url: '/',
        force: true,
        ttl: 3600,
      });
      return res.status(200).json(summary);
    }

    const { dateKey, weekday, mins } = istNow();
    if (weekday > 5) return res.status(200).json({ ...summary, skipped: 'weekend' });
    if (mins < PRE_OPEN[0] || mins >= CLOSE[1]) return res.status(200).json({ ...summary, skipped: 'outside market window' });
    if (everyone.length === 0) return res.status(200).json({ ...summary, skipped: 'no subscribed devices' });

    const inWin = (w) => mins >= w[0] && mins < w[1];
    const marketOpen = mins >= MARKET_HOURS[0] && mins < MARKET_HOURS[1];

    const all = await fetchIndices().catch(() => null);
    const indices = (all ?? []).filter((i) => INDEX_KEYS.includes(i.key));
    const sharedRef = db.collection('pushState').doc('market');

    // --- Pre-open / open / close summary: one notification per index. ---
    const which = inWin(PRE_OPEN) ? 'pre' : inWin(OPEN) ? 'open' : inWin(CLOSE) ? 'close' : null;
    if (which && indices.length) {
      const won = await claim(db, sharedRef, dateKey, [which]);
      if (won.length) {
        const verb = which === 'pre' ? 'Pre-market' : which === 'open' ? 'Opened' : 'Closed';
        const parts = indices.map((i) => {
          const pct = i.previousClose ? ((i.price - i.previousClose) / i.previousClose) * 100 : undefined;
          return {
            title: `${i.name} ${verb}`,
            body: `${fmt(i.price)}${pct !== undefined ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''}`,
          };
        });
        summary.sent += await pushParts(everyone, parts, `${dateKey}:${which}`);
      }
    }

    if (marketOpen) {
      // --- Big index moves (2% / 5%). ---
      for (const i of indices) {
        if (!i.previousClose) continue;
        const pct = ((i.price - i.previousClose) / i.previousClose) * 100;
        const dir = pct >= 0 ? 'up' : 'down';
        const crossed = MOVE_LEVELS.filter((l) => Math.abs(pct) >= l);
        if (!crossed.length) continue;
        const top = crossed[crossed.length - 1];
        const won = await claim(db, sharedRef, dateKey, [...crossed.map((l) => `${i.key}:${dir}${l}`)]);
        if (won.includes(`${i.key}:${dir}${top}`)) {
          summary.sent += await pushTo(everyone, {
            title: `${i.name} ${dir === 'up' ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`,
            body: `Now ${fmt(i.price)}`,
            tag: `${dateKey}:${i.key}:${dir}${top}`,
            url: '/',
          });
        }
      }

      // --- Each person's own holdings (2% / 5% vs yesterday's close). ---
      const quotes = new Map();
      const quoteFor = (symbol, market) => {
        const k = `${market}:${symbol}`;
        if (!quotes.has(k)) quotes.set(k, resolveQuote(symbol, market).catch(() => null));
        return quotes.get(k);
      };
      for (const [uid, subs] of byUser) {
        const assets = await db.collection('users').doc(uid).collection('assets').get();
        const stateRef = db.collection('users').doc(uid).collection('meta').doc('pushState');
        for (const doc of assets.docs) {
          const a = doc.data();
          if (!a.symbol || !(a.quantity > 0)) continue;
          const q = await quoteFor(a.symbol, a.market ?? 'IN');
          if (!q?.price || !q.previousClose) continue;
          const pct = ((q.price - q.previousClose) / q.previousClose) * 100;
          const dir = pct >= 0 ? 'up' : 'down';
          const crossed = MOVE_LEVELS.filter((l) => Math.abs(pct) >= l);
          if (!crossed.length) continue;
          const top = crossed[crossed.length - 1];
          const sym = String(a.symbol).toUpperCase();
          const won = await claim(db, stateRef, dateKey, crossed.map((l) => `${sym}:${dir}${l}`));
          if (!won.includes(`${sym}:${dir}${top}`)) continue;
          const cur = a.currency ?? q.currency ?? 'INR';
          summary.sent += await pushTo(subs, {
            title: `${a.name ?? sym} ${dir === 'up' ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`,
            body: `Now ${money(q.price, cur)}`,
            tag: `${dateKey}:${sym}:${dir}${top}`,
            url: '/wealth',
          });
        }
      }
    }

    return res.status(200).json(summary);
  } catch (err) {
    console.error('push send failed', err);
    return res.status(500).json({ error: String(err?.message ?? err) });
  }
}
