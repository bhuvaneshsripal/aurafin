import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useLivePricesStore, type SipLiveEntry } from '../store/livePricesStore';
import { fetchFundNavHistory, computeSipLiveValue } from '../utils/mutualFunds';
import { listSipInstallments } from '../utils/assetValues';

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
        const entries = await Promise.all(
          sipAssets.map(async (asset) => {
            const installments = listSipInstallments(asset);
            if (installments.length === 0) return null;
            const nav = await fetchFundNavHistory(Number(asset.symbol));
            if (!nav) return null;
            const { value, units } = computeSipLiveValue(installments, nav);
            const entry: SipLiveEntry = { value, units, latestNav: nav.latestNav };
            return [asset.symbol as string, entry] as const;
          })
        );

        const sipValues: Record<string, SipLiveEntry> = {};
        for (const e of entries) {
          if (e) sipValues[e[0]] = e[1];
        }
        if (Object.keys(sipValues).length > 0) setSipValues(sipValues);
      } catch {
        // A failed refresh just leaves the last-known values in place.
      } finally {
        fetching.current = false;
      }
    };

    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupKey, setSipValues]);
}
