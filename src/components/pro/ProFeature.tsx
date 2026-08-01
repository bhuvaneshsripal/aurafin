import type { ReactNode } from 'react';
import { useIsPro } from '../../hooks/useIsPro';
import ProBadge from './ProBadge';

/**
 * Future-ready wrapper for anything that should eventually be gated behind
 * Pro. Today `useIsPro()` always returns `true` (see
 * `src/config/proFeatures.ts`), so this simply renders `children` — nothing
 * is blocked, disabled, or redirected. Once real subscription checks are
 * turned on, this is the one place a lock/upsell state would be added.
 *
 * Usage:
 *   <ProFeature label="Family Profiles">
 *     <AddProfileButton />
 *   </ProFeature>
 *
 * `showBadge` (default true) renders a small gold "PRO" badge inline before
 * the children — set it to false if the badge is already shown elsewhere
 * (e.g. in a page header) and you just want the gating behavior.
 */
export default function ProFeature({
  children,
  showBadge = true,
  badgeSize = 'sm',
  className = '',
}: {
  children: ReactNode;
  showBadge?: boolean;
  badgeSize?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  // Bypassed for now — every Pro feature stays fully usable. When real
  // gating is enabled, an `if (!isPro) return <UpsellState />;` (or similar)
  // belongs here, sourced from this same `unlocked` value.
  const unlocked = useIsPro();
  void unlocked;

  if (!showBadge) return <>{children}</>;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {children}
      <ProBadge size={badgeSize} />
    </span>
  );
}
