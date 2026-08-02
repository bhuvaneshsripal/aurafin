/**
 * AURAFIN PRO — FEATURE FLAG CONFIG
 * ===================================
 * This is the single source of truth for which features are "Pro" and
 * whether Pro access is currently gated.
 *
 * HOW TO TURN ON REAL SUBSCRIPTION ENFORCEMENT LATER
 * ----------------------------------------------------
 * 1. Flip `PRO_ACCESS_BYPASSED` below to `false`.
 * 2. Flip `PREMIUM_PURCHASE_ENABLED` in `src/pages/Settings.tsx` to `true`
 *    (it already restores the redeem-code / UPI purchase flow — nothing
 *    to rebuild).
 * That's it — every `<ProFeature>` wrapper and `useIsPro()` call across
 * the app reads from here, so nothing else needs to change.
 *
 * Until then, `PRO_ACCESS_BYPASSED = true` means every Pro feature stays
 * fully usable for everyone. Only the visual Crown/PRO marking is live.
 */

/** THE single flag. `true` = everyone has Pro access (current state).
 *  `false` = Pro features fall back to the real `usePremiumStore` status. */
export const PRO_ACCESS_BYPASSED = true;

/**
 * The one Pro restriction that's actually enforced today, independent of
 * `PRO_ACCESS_BYPASSED` above (which only covers the *other* six Pro
 * features listed below). Free accounts can track up to this many assets;
 * past that, adding another asset shows an upgrade prompt instead. Change
 * this number to adjust the free tier, or see `useAssetLimitReached` in
 * `src/hooks/useIsPro.ts` for where it's checked.
 */
export const FREE_ASSET_LIMIT = 30;

export interface ProFeatureDef {
  id: string;
  /** Short label as shown next to a Crown/PRO badge. */
  label: string;
  /** One line used on the Pro page's feature checklist. */
  description: string;
}

/** The seven features currently marked as Pro across the app. Keeping this
 *  list centralized means the Pro page, badges, and any future gating logic
 *  all stay in sync automatically. */
export const PRO_FEATURES: ProFeatureDef[] = [
  {
    id: 'unlimited-assets-goals',
    label: 'Unlimited Assets & Goals',
    description: 'Track every account, holding, and goal with no cap.',
  },
  {
    id: 'income-expense-insights',
    label: 'Income & Expense Insights',
    description: 'Deeper spending breakdowns and monthly trend insights.',
  },
  {
    id: 'family-profiles',
    label: 'Family Profiles',
    description: 'Manage finances for your whole household in one account.',
  },
  {
    id: 'multi-currency',
    label: 'Multi-Currency Support',
    description: 'Hold and track assets across any currency, seamlessly.',
  },
  {
    id: 'share-with-others',
    label: 'Share with up to 5 People',
    description: 'Give your spouse, advisor, or CA view or full access.',
  },
  {
    id: 'broker-import',
    label: 'Import from Any Broker',
    description: 'Bulk-import your holdings from any brokerage export.',
  },
  {
    id: 'phased-investment-calculator',
    label: 'Phased Investment Calculator',
    description: 'Model step-changing SIPs across custom year ranges.',
  },
];
