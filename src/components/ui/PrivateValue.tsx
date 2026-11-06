import type { ReactNode } from 'react';
import { cn } from './cn';

/** True when a formatted amount is the privacy placeholder (dots). */
export const isMasked = (v: ReactNode): v is string => typeof v === 'string' && v.includes('••');

/**
 * Privacy mode: instead of a row of dots, show a blurred stand-in with a small
 * "hidden" label. The stand-in is fixed dummy text, so nothing real is in the DOM.
 */
export function BlurredAmount({ className, label = true }: { className?: string; label?: boolean }) {
  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span aria-hidden className="select-none blur-[7px]">₹00,00,000</span>
      <span className="sr-only">Amount hidden</span>
      {label && <span aria-hidden className="text-xs font-normal text-muted">hidden</span>}
    </span>
  );
}

/** Renders `value`, swapping the privacy dots for a blurred stand-in. */
export default function PrivateValue({ value, label }: { value: ReactNode; label?: boolean }) {
  return isMasked(value) ? <BlurredAmount label={label} /> : <>{value}</>;
}
