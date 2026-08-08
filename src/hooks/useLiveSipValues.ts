import { useEffect, useRef } from 'react';
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
  const fetching = useRef(false);

  const sipAssets = assets.filter(
    (a) => a.assetClass === 'sip' && a.symbol && /^\d+$/.test(a.symbol)
  );
  // Key off scheme code + the fields that affect the computed value, so a
  // new installment becoming due (or an edited SIP amount/date) triggers a
  // refresh without waiting a full poll interval.
  const lookupKey = sipAssets
    .map(
      (a) =>
        `${a.symbol}|${a.sipAmount ?? ''}|${a.sipFrequency ?? ''}|${a.sipDay ?? ''}|${a.startDate ?? ''}|${a.investedValue ?? ''}`
    )
    .sort()
    .join(',');

  useEffect(() => {
    if (!lookupKey) return;

    const refresh = async () => {
      if (fetching.current) return;
      fetching.current = true;
      try {
        const sipValues: Record<string, SipLiveEntry> = {};
        // Sequential with a small stagger — most of these resolve instantly
        // from the persisted cache anyway, but for the ones that do need a
        // real network call, firing them all at once is exactly the kind of
        // burst that trips a free API's rate limiting.
        for (const asset of sipAssets) {
          const installments = listSipInstallments(asset);
          if (installments.length === 0) continue;
          const nav = await fetchFundNavHistory(Number(asset.symbol), asset.startDate);
          if (!nav) continue;
          const { value, units } = computeSipLiveValue(installments, nav);
          sipValues[asset.symbol as string] = { value, units, latestNav: nav.latestNav };
          await new Promise((r) => setTimeout(r, 150));
        }
        if (Object.keys(sipValues).length > 0) setSipValues(sipValues);
      } catch {
        // A failed refresh just leaves the last-known values in place.
      } finally {
        fetching.current = false;
        setSipValuesAttempted(true);
      }
    };

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, setSipValues, setSipValuesAttempted]);
}
