import { useEffect, useRef } from 'react';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useLivePricesStore } from '../store/livePricesStore';
import { useSnapshotsStore } from '../store/snapshotsStore';
import { useNotificationPreferencesStore } from '../store/notificationPreferencesStore';
import { getWeeklyDigestWindow } from '../utils/marketHours';
import { buildWeeklyDigestPayload } from '../utils/weeklyDigest';
import { sendWeeklyDigestEmail, isWeeklyDigestEmailConfigured } from '../utils/otp';

const CHECK_INTERVAL_MS = 5 * 60_000; // every 5 minutes is plenty for a once-a-week send

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
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const goldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
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
        const payload = buildWeeklyDigestPayload({
          toName: user.displayName ?? 'there',
          assets,
          liabilities,
          livePrices,
          sipValues,
          goldPricePerGram,
          snapshots,
        });

        await sendWeeklyDigestEmail({ toEmail: user.email, ...payload });
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
  }, [
    user,
    weeklyDigestEnabled,
    lastSentFor,
    markSent,
    assets,
    liabilities,
    livePrices,
    sipValues,
    goldPricePerGram,
    snapshots,
  ]);
}
