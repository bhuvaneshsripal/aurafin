import { usePremiumStore, selectIsPremium } from '../store/premiumStore';
import { useAssetsStore } from '../store/assetsStore';
import { PRO_ACCESS_BYPASSED, FREE_ASSET_LIMIT } from '../config/proFeatures';

/**
 * The single hook every Pro-gated feature should use to decide whether to
 * actually restrict something. Right now `PRO_ACCESS_BYPASSED` is `true`,
 * so this always returns `true` and nothing is blocked — flip that one
 * flag in `src/config/proFeatures.ts` when subscriptions go live and every
 * caller of this hook starts respecting real Premium status automatically.
 */
export function useIsPro(): boolean {
  const isRealPremium = usePremiumStore(selectIsPremium);
  return PRO_ACCESS_BYPASSED ? true : isRealPremium;
}

/**
 * Whether the signed-in account has hit the free plan's asset cap
 * (`FREE_ASSET_LIMIT`). Unlike `useIsPro()`, this checks real Premium
 * status directly rather than `PRO_ACCESS_BYPASSED` — the asset limit is a
 * live restriction today, independent of whether the other six Pro
 * features are still bypassed.
 */
export function useAssetLimitReached(): boolean {
  const isPremium = usePremiumStore(selectIsPremium);
  const assetCount = useAssetsStore((s) => s.assets.length);
  return !isPremium && assetCount >= FREE_ASSET_LIMIT;
}
