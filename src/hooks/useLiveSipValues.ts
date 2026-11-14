import { useEffect } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore, type SipLiveEntry } from '../store/livePricesStore';
import { fetchFundNavHistory, computeSipLiveValue } from '../utils/mutualFunds';
import { listSipInstallments } from '../utils/assetValues';

// Polled every 60s, same cadence as equities and gold, so all live values
// refresh in lockstep across the app. Note: mutual fund NAVs are only
// published once a day after market close, so this won't surface a new
// number more often than that — but it does mean a freshly-published NAV,
// or a newly-added/edited SIP, shows up within a minute instead of up to 15.
const REFRESH_MS = 60_000;

/**
 * Keeps the auto-calculated Current Value for linked SIPs (mutual fund
 * scheme code stored in `asset.symbol`) up to date everywhere the asset is
 * shown — not just while the edit form is open. Mirrors useLivePrices, but
 * prices SIPs off mfapi.in NAV history instead of Yahoo Finance quotes.
 */
export function useLiveSipValues() {
  const assets = useAssetsStore((s) => s.assets);
  const setSipValues = useLivePricesStore((s) => s.setSipValues);
  const setSipValuesAttempted = useLivePricesStore((s) => s.setSipValuesAttempted);

  const sipAssets = assets.filter(
    (a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol)
  );
  // Key off scheme code + the fields that affect the computed value, so a
  // new installment becoming due (or an edited SIP amount/date) triggers a
  // refresh without waiting a full poll interval.
  const lookupKey = sipAssets
    .map(
      (a) =>
        `${a.symbol}|${a.sipAmount ?? ''}|${a.sipFrequency ?? ''}|${a.sipDay ?? ''}|${a.startDate ?? ''}|${a.investedValue ?? ''}|${a.sipPausedAt ?? ''}|${JSON.stringify(a.sipPauseHistory ?? [])}|${JSON.stringify(a.sipAmountSchedule ?? [])}|${JSON.stringify(a.sipTopUps ?? [])}`
    )
    .sort()
    .join(',');

  useEffect(() => {
    if (!lookupKey) return;

    // Each effect run owns its own `cancelled` flag + `running` guard.
    // Previously one shared `fetching` ref was used: if a refresh was still
    // in flight when the SIP changed (resume, Buy More, edit…), the refresh
    // for the NEW data was skipped, and the old run then wrote values
    // computed from the OLD data — so the screen kept showing pre-change
    // numbers until the next poll. Now a changed SIP cancels the old run
    // (its result is discarded) and immediately starts a fresh one.
    let cancelled = false;
    let running = false;

    const refresh = async () => {
      if (running) return;
      running = true;
      try {
        // Read the latest assets at run time (not the render-time closure)
        // so a poll tick never prices a SIP with stale fields.
        const latest = useAssetsStore
          .getState()
          .assets.filter((a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol));
        const sipValues: Record<string, SipLiveEntry> = {};
        // A few at a time instead of one after another with a pause between each: most resolve
        // instantly from the persisted cache, and for the ones that need a real network call a
        // small pool (4 in flight) is fast without the burst that trips a free API's rate limit.
        let next = 0;
        const worker = async () => {
          while (next < latest.length && !cancelled) {
            const asset = latest[next++];
            const installments = listSipInstallments(asset);
            if (installments.length === 0) continue;
            const nav = await fetchFundNavHistory(Number(asset.symbol), asset.startDate);
            if (cancelled || !nav) continue;
            const { value, units } = computeSipLiveValue(installments, nav);
            sipValues[asset.symbol as string] = { value, units, latestNav: nav.latestNav };
          }
        };
        await Promise.all(Array.from({ length: Math.min(4, latest.length) }, worker));
        if (cancelled) return;
        if (Object.keys(sipValues).length > 0) setSipValues(sipValues);
      } catch {
        // A failed refresh just leaves the last-known values in place.
      } finally {
        running = false;
        if (!cancelled) setSipValuesAttempted(true);
      }
    };

    refresh();
    const id = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    // Back in the foreground (or back online): refresh now instead of waiting for the next tick,
    // which after a long time away could otherwise leave SIP values stale for up to a minute.
    const onBack = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('online', onBack);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('online', onBack);
    };
  }, [lookupKey, setSipValues, setSipValuesAttempted]);
}
