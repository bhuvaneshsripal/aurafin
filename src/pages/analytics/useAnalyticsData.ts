import { useMemo, useState } from 'react';
import { useAssetsStore } from '../../store/assetsStore';
import { useLivePricesStore } from '../../store/livePricesStore';
import { useHouseholdProfilesStore } from '../../store/householdProfilesStore';
import { isFullySold } from '../../utils/investmentPnl';
import { resolveAssetValues } from '../../utils/assetValues';
import { buildAllocation, type ValuedAsset } from '../../utils/portfolioAnalytics';
import { computeLiquidAssets } from '../../utils/financialHealth';

/** Shared, currency-scoped view of the portfolio for every Analytics tab. */
export function useAnalyticsData() {
  const allAssets = useAssetsStore((s) => s.assets);
  const livePrices = useLivePricesStore((s) => s.prices);
  const sipValues = useLivePricesStore((s) => s.sipValues);
  const gold = useLivePricesStore((s) => s.goldPricePerGram);
  const activeProfileId = useHouseholdProfilesStore((s) => s.activeProfileId);

  // Includes fully sold holdings — their realised gains still matter for tax.
  const profileAssets = useMemo(
    () => (activeProfileId ? allAssets.filter((a) => a.profileId === activeProfileId) : allAssets),
    [allAssets, activeProfileId]
  );
  const scoped = useMemo(() => profileAssets.filter((a) => !isFullySold(a)), [profileAssets]);

  // Amounts in different currencies can't be summed (the app has no FX rates
  // for aggregates), so Analytics works one currency at a time.
  const currencies = useMemo(() => {
    const totals = new Map<string, number>();
    for (const a of scoped) totals.set(a.currency, (totals.get(a.currency) ?? 0) + Math.max(0, a.value));
    return [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  }, [scoped]);
  const [picked, setPicked] = useState<string | null>(null);
  const currency = picked && currencies.includes(picked) ? picked : currencies[0] ?? 'INR';

  const assets = useMemo(() => scoped.filter((a) => a.currency === currency), [scoped, currency]);
  const taxAssets = useMemo(() => profileAssets.filter((a) => a.currency === currency), [profileAssets, currency]);

  const items: ValuedAsset[] = useMemo(
    () => assets.map((a) => ({ asset: a, value: resolveAssetValues(a, livePrices, sipValues, gold).value })),
    [assets, livePrices, sipValues, gold]
  );
  const allocation = useMemo(() => buildAllocation(items), [items]);
  const liquid = useMemo(() => computeLiquidAssets(assets, livePrices, sipValues), [assets, livePrices, sipValues]);

  return { assets, taxAssets, items, allocation, liquid, currency, currencies, setCurrency: setPicked, livePrices, sipValues, gold, hasData: assets.length > 0 };
}
export type AnalyticsData = ReturnType<typeof useAnalyticsData>;
