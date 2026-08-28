import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useNotificationPreferencesStore } from '../store/notificationPreferencesStore';
import { getWeeklyDigestWindow } from '../utils/marketHours';
import { resolveAssetValues } from '../utils/assetValues';
import { formatCurrency } from '../utils/currency';
import { sendWeeklyDigestEmail, isWeeklyDigestEmailConfigured } from '../utils/otp';

const CHECK_INTERVAL_MS = 5 * 60_000; // every 5 minutes is plenty for a once-a-week send
const WEEK_MS = 7 * 24 * 60 * 60_000;
// A snapshot is only usable as "a week ago" if it's within a day or so of
// exactly 7 days back — otherwise (e.g. the person's oldest snapshot is a
// month old) we'd be silently comparing against the wrong baseline instead
// of just omitting the week-over-week figure.
const WEEK_SNAPSHOT_TOLERANCE_MS = 1.5 * 24 * 60 * 60_000;

/**
 * Sends the Saturday 10:00 AM IST weekly portfolio digest — a Zerodha-style
 * "here's how your week went" email — via the same client-side EmailJS
 * setup the rest of the app's emails use (this is a free, backend-less
 * app, so there's no server cron; see the note in Settings for the
 * trade-off that comes with that).
 *
 * Mounted once near the app root. On every check it asks "is it currently
 * Saturday >= 10 AM IST, and have we already sent today's digest?" — if
 * due and not yet sent, it composes the email from the person's current
 * portfolio numbers and fires it off, then marks today as sent so it
 * doesn't repeat every 5 minutes for the rest of the send window.
 */
export function useWeeklyDigestScheduler() {
  const user = useAuthStore((s) => s.user);
  const weeklyDigestEnabled = useNotificationPreferencesStore((s) => s.prefs.weeklyDigestEmail);
  const lastSentFor = useNotificationPreferencesStore((s) => s.weeklyDigestLastSentFor);
  const markSent = useNotificationPreferencesStore((s) => s.markWeeklyDigestSent);

  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const livePrices = useLivePricesStore((s) => s.prices);
  const snapshots = useSnapshotsStore((s) => s.snapshots);

  // Avoids double-sending if two checks land in the same tick (e.g. the
  // interval firing right as a re-render happens) before markSent's write
  // has propagated back through the store.
  const sendingRef = useRef(false);

  useEffect(() => {
    const check = async () => {
      if (!user?.email) return;
      if (!weeklyDigestEnabled) return;
      if (!isWeeklyDigestEmailConfigured()) return;
      if (sendingRef.current) return;

      const { due, dateKey } = getWeeklyDigestWindow();
      if (!due || lastSentFor === dateKey) return;

      sendingRef.current = true;
      try {
        const totalAssets = assets.reduce((s, a) => s + resolveAssetValues(a, livePrices).value, 0);
        const totalLiabilities = liabilities.reduce((s, l) => s + l.outstanding, 0);
        const netWorth = totalAssets - totalLiabilities;

        // Look for a snapshot taken ~7 days ago to show the week's move,
        // like Zerodha's digest does. Snapshots are taken manually in this
        // app (not automatic daily ones), so there's no guarantee one
        // exists at exactly the right distance — if none is close enough,
        // the digest just omits the week-over-week comparison rather than
        // showing a misleading number.
        const now = Date.now();
        const weekAgoSnapshot = snapshots
          .map((snap) => ({ snap, age: Math.abs(now - new Date(snap.date).getTime() - WEEK_MS) }))
          .filter(({ age }) => age <= WEEK_SNAPSHOT_TOLERANCE_MS)
          .sort((a, b) => a.age - b.age)[0]?.snap;

        const weekChange = weekAgoSnapshot ? netWorth - weekAgoSnapshot.netWorth : null;
        const weekChangePercent =
          weekChange !== null && weekAgoSnapshot!.netWorth !== 0
            ? (weekChange / weekAgoSnapshot!.netWorth) * 100
            : null;

        await sendWeeklyDigestEmail({
          toEmail: user.email,
          netWorth: formatCurrency(netWorth),
          weekChange: weekChange !== null ? formatCurrency(weekChange) : 'N/A',
          weekChangePercent: weekChangePercent !== null ? `${weekChangePercent.toFixed(2)}%` : 'N/A',
        });
        markSent(dateKey);
      } catch {
        // Silent — a missed digest isn't worth surfacing an error toast
        // over; the next 5-minute check will just retry within the same
        // Saturday window since markSent only fires on success.
      } finally {
        sendingRef.current = false;
      }
    };

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [user, weeklyDigestEnabled, lastSentFor, markSent, assets, liabilities, livePrices, snapshots]);
}
