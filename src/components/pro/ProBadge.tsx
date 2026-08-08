import type { ReactNode } from 'react';
import { Crown } from 'lucide-react';

/**
 * Small gold "PRO" pill with a Crown icon. Drop this next to any label,
 * button, nav item, or section header that belongs to one of the features
 * listed in `src/config/proFeatures.ts`.
 *
 * Purely visual — it never blocks anything. See `useIsPro()` /
 * `<ProFeature>` for the (currently bypassed) access-control side.
 */
export default function ProBadge({
  size = 'sm',
  className = '',
  onClick,
}: {
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  onClick?: () => void;
}) {
  const sizes = {
    xs: { pad: 'px-1.5 py-[1px]', text: 'text-[9px]', icon: 10, gap: 'gap-0.5' },
    sm: { pad: 'px-2 py-0.5', text: 'text-[10px]', icon: 11, gap: 'gap-1' },
    md: { pad: 'px-2.5 py-1', text: 'text-[11px]', icon: 13, gap: 'gap-1' },
  }[size];

  const badgeClass = `inline-flex items-center ${sizes.gap} ${sizes.pad} rounded-full font-bold uppercase tracking-wide text-white shrink-0 bg-gradient-to-r from-amber-400 via-yellow-500 to-amber-500 shadow-[0_1px_4px_rgba(217,161,20,0.45)] ${sizes.text} ${className}`;

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${badgeClass} cursor-pointer hover:brightness-105 active:brightness-95 transition-[filter]`}
      >
        <Crown size={sizes.icon} strokeWidth={2.5} className="drop-shadow-sm" />
        Pro
      </button>
    );
  }

  return (
    <span className={badgeClass}>
      <Crown size={sizes.icon} strokeWidth={2.5} className="drop-shadow-sm" />
      Pro
    </span>
  );
}

/** Standalone gold Crown icon, for spots too tight for the full pill
 *  (dense list rows, compact nav items, table cells). */
export function ProCrown({
  size = 14,
  className = '',
}: {
  size?: number;
  className?: string;
}) {
  return (
    <Crown
      size={size}
      strokeWidth={2.25}
      className={`text-amber-500 fill-amber-400/90 shrink-0 ${className}`}
    />
  );
}

/** Label + gold badge in one go — the most common usage. */
export function ProLabel({
  children,
  badgeSize = 'sm',
  className = '',
}: {
  children: ReactNode;
  badgeSize?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {children}
      <ProBadge size={badgeSize} />
    </span>
  );
}
