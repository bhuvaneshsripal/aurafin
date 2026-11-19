import { useEffect, useRef } from 'react';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAssetsStore } from '../store/assetsStore';
import { useLiabilitiesStore } from '../store/liabilitiesStore';
import { useLivePricesStore, resolveLivePrice } from '../store/livePricesStore';
import { useSyncStatusStore } from '../store/syncStatusStore';
import { useNotificationPreferencesStore } from '../store/notificationPreferencesStore';
import { resolveAssetValues } from '../utils/assetValues';
import { isFullySold } from '../utils/investmentPnl';
import { ASSET_CLASS_TO_CATEGORY, MARKET_SELECTABLE_CLASSES } from '../utils/taxonomy';

/**
 * Keeps what the weekly digest email needs on the server.
 *
 * The Saturday 10:00 AM IST email is sent by the server (api/push/send?digest=1), so it arrives even
 * when the app is closed. The server can't run the app's valuation maths (SIP NAVs, gold rate, deposit
 * interest, PPF...), so while the app is open this hook saves a compact copy of every holding's value,
 * worked out by the same resolveAssetValues the Dashboard uses, to users/{uid}/meta/digestInput.
 * The server then re-prices the stocks / ETFs itself at send time.
 *
 * Two separate writes:
 *  - the on/off switch, saved immediately whenever it changes;
 *  - the portfolio, saved only after the assets have been confirmed by the server (so a half-loaded
 *    app can never overwrite the saved copy with an empty one) and at most every 5 minutes.
 */
const PORTFOLIO_MIN_GAP_MS = 5 * 60_000;
const MAX_HOLDINGS = 500;

export function useDigestSync() {
  const user = useAuthStore((s) => s.user);
  const enabled = useNotificationPreferencesStore((s) => s.prefs.weeklyDigestEmail);
  // False until this account's saved switches have been read from the cloud (see useNotificationPrefsSync);
  // writing earlier would push this device's default "on" over a switch turned off on another device.
  const hydrated = useNotificationPreferencesStore((s) => s.hydrated);

  const assets = useAssetsStore((s) => s.assets);
  const liabilities = useLiabilitiesStore((s) => s.liabilities);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const sipValuesAttempted = useLivePricesStore((s) => s.sipValuesAttempted);
  const goldPricePerGram = useLivePricesStore((s) => s.goldPricePerGram);
  const pricesAttempted = useLivePricesStore((s) => s.pricesAttempted);
  const goldAttempted = useLivePricesStore((s) => s.goldAttempted);
  const goldPriceError = useLivePricesStore((s) => s.goldPriceError);
  const assetsConfirmed = useSyncStatusStore((s) => s.assetsServerConfirmed);
  const liabilitiesConfirmed = useSyncStatusStore((s) => s.liabilitiesServerConfirmed);

  const uid = user?.uid;
  const guest = (user as { isAnonymous?: boolean } | null)?.isAnonymous === true;

  // 1) The on/off switch.
  useEffect(() => {
    if (!uid || guest || !hydrated) return;
    void setDoc(doc(db, 'users', uid, 'meta', 'digestInput'), { weeklyDigestEmail: enabled }, { merge: true }).catch(() => {});
  }, [uid, guest, enabled, hydrated]);

  // 2) The portfolio.
  const lastSig = useRef('');
  const lastAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!uid || guest || !enabled || !hydrated) return;
    if (!assetsConfirmed || !liabilitiesConfirmed) return;
    // Linked SIPs are valued from NAV history: wait until that has been tried at least once.
    const hasSip = assets.some((a) => a.assetClass === 'sip');
    if (hasSip && !sipValuesAttempted) return;
    // Same readiness rule as the Dashboard: do not save until the live share prices (and the gold rate)
    // have arrived. Saving earlier stored every stock at its old typed-in value and marked none of them
    // as re-priceable, so the email showed an out-of-date Portfolio value / Profit-loss / Net worth.
    const hasLiveEquity = assets.some((a) => !!a.symbol && (a.quantity ?? 0) > 0);
    const everyEquityPriced = assets.every((a) => !a.symbol || !((a.quantity ?? 0) > 0) || resolveLivePrice(a.symbol, livePrices) !== undefined);
    if (hasLiveEquity && !pricesAttempted && !everyEquityPriced) return;
    const hasLiveGold = assets.some((a) => a.assetClass === 'gold' && (a.quantity ?? 0) > 0);
    if (hasLiveGold && goldPricePerGram === null && !goldAttempted && !goldPriceError) return;

    // Fully sold-out holdings are not part of the portfolio (the Dashboard and Wealth hide them), but
    // they keep their old "value" on record while their invested amount drops to 0. Counting them
    // made the email's Portfolio value, Profit / loss and Net worth too high while Invested stayed right.
    const holdings = assets.filter((a) => !isFullySold(a)).slice(0, MAX_HOLDINGS).map((a) => {
      const r = resolveAssetValues(a, livePrices, sipValues, goldPricePerGram);
      const repriceable =
        MARKET_SELECTABLE_CLASSES.has(a.assetClass) &&
        !!a.symbol &&
        (a.quantity ?? 0) > 0 &&
        resolveLivePrice(a.symbol, livePrices) !== undefined;
      return {
        id: a.id,
        name: a.name,
        cls: ASSET_CLASS_TO_CATEGORY[a.assetClass]?.label ?? 'Other',
        value: Math.round(r.value * 100) / 100,
        invested: r.invested !== undefined ? Math.round(r.invested * 100) / 100 : null,
        repriceable,
        updatedAt: a.updatedAt ?? 0,
        ...(repriceable ? { symbol: a.symbol!.toUpperCase(), market: a.market === 'US' ? 'US' : 'IN', qty: a.quantity } : {}),
      };
    });
    const totalLiabilities = Math.round(liabilities.reduce((s, l) => s + l.outstanding, 0) * 100) / 100;

    // Stock prices tick every second; only re-save when something the server can't recompute changed
    // (non-stock values, quantities, the lists themselves), not on every price move.
    const sig = JSON.stringify({
      totalLiabilities,
      h: holdings.map((h) => (h.repriceable ? [h.id, h.name, h.qty, h.invested, h.updatedAt] : [h.id, h.name, h.value, h.invested, h.updatedAt])),
    });
    if (sig === lastSig.current && Date.now() - lastAt.current < 6 * 3600_000) return;

    const wait = Math.max(3_000, PORTFOLIO_MIN_GAP_MS - (Date.now() - lastAt.current));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setDoc(
        doc(db, 'users', uid, 'meta', 'digestInput'),
        { holdings, totalLiabilities, name: user?.displayName ?? '', updatedAt: Date.now(), weeklyDigestEmail: enabled },
        { merge: true }
      )
        .then(() => {
          lastSig.current = sig;
          lastAt.current = Date.now();
        })
        .catch(() => {});
    }, lastAt.current === 0 ? 3_000 : wait);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [uid, guest, enabled, hydrated, assets, liabilities, livePrices, sipValues, sipValuesAttempted, goldPricePerGram, pricesAttempted, goldAttempted, goldPriceError, assetsConfirmed, liabilitiesConfirmed, user?.displayName]);
}
