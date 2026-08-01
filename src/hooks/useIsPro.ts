import { usePremiumStore, selectIsPremium } from '../store/premiumStore';
import { PRO_ACCESS_BYPASSED } from '../config/proFeatures';

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
