import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface ValuationIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Valuation nav icon: a report with a growth chart and a dollar magnifier.
 * It is a full-colour picture (public/valuation-icon.png), so unlike the lucide
 * icons it ignores `color` / `strokeWidth`; it takes the same props so it drops
 * in wherever a lucide icon is expected (BottomNav, Sidebar).
 */
const ValuationIcon = forwardRef<SVGSVGElement, ValuationIconProps>(
  ({ size = 24, strokeWidth: _sw, color: _c, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden
      {...props}
    >
      <image href="/valuation-icon.png" x="0" y="0" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
    </svg>
  ),
);
ValuationIcon.displayName = 'ValuationIcon';
export default ValuationIcon;
