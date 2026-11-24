// Automatic weekly net-worth snapshot: every Saturday ~10:00 AM IST, sent from the server so it is
// recorded whether or not the app is open (and whether or not the person has the digest email on).
//
// It reuses the numbers the digest email is built from (see digest.js): the holdings the app last
// saved to users/{uid}/meta/digestInput, with stocks / ETFs re-priced at their latest close. The result
// is written to users/{uid}/snapshots with the same {id, date, netWorth, totalAssets, totalLiabilities}
// shape the app uses, so it appears on the "Net worth over time" chart.
//
//  * One snapshot per person per Saturday: nothing is written if a snapshot already exists for that
//    date (for example one the app itself recorded), and the document id is fixed ("auto-<date>"), so
//    repeated cron calls can never create duplicates.
//  * When the app is opened later that day it updates this same entry with live values.
//  * Non-stock holdings (mutual funds, SIPs, gold, deposits...) are as of the last visit to the app.
import { computeDigest } from './digest.js';

/**
 * Returns { summary, digests } — `digests` maps uid -> computed digest so the email step that runs
 * right after does not have to re-price every stock a second time.
 */
export async function runWeeklySnapshots(db, { dateKey }) {
  const summary = { users: 0, saved: 0, skipped: {}, errors: [] };
  const digests = new Map();
  const skip = (why) => { summary.skipped[why] = (summary.skipped[why] ?? 0) + 1; };

  const all = await db.collectionGroup('meta').get();
  const inputs = all.docs.filter((d) => d.id === 'digestInput').map((d) => ({ uid: d.ref.parent.parent.id, data: d.data() }));
  if (!inputs.length) skip('no users');

  for (const { uid, data } of inputs) {
    summary.users++;
    try {
      const holdings = Array.isArray(data.holdings) ? data.holdings : [];
      if (!holdings.length && !(Number(data.totalLiabilities) > 0)) { skip('no saved portfolio yet'); continue; }

      const snapCol = db.collection('users').doc(uid).collection('snapshots');
      const existing = await snapCol.where('date', '==', dateKey).limit(1).get();
      if (!existing.empty) { skip('already has a snapshot for this date'); continue; }

      const digest = await computeDigest({ ...data, name: data.name || '' });
      digests.set(uid, digest);
      if (!Number.isFinite(digest.netWorth)) { skip('could not value the portfolio'); continue; }

      const round2 = (n) => Math.round(n * 100) / 100;
      try {
        await snapCol.doc(`auto-${dateKey}`).create({
          id: `auto-${dateKey}`,
          date: dateKey,
          netWorth: round2(digest.netWorth),
          totalAssets: round2(digest.totalAssets),
          totalLiabilities: round2(digest.totalLiabilities),
          auto: true,
          createdAt: Date.now(),
        });
        summary.saved++;
      } catch (err) {
        // create() fails with ALREADY_EXISTS when another run got there first: that is fine.
        if (err?.code === 6 || /already exists/i.test(String(err?.message))) skip('already saved');
        else throw err;
      }
    } catch (err) {
      summary.errors.push({ uid: uid.slice(0, 6), error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  return { summary, digests };
}
