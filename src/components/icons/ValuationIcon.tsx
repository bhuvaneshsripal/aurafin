import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface ValuationIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Valuation nav icon: a report page with a bar chart and a dollar magnifier,
 * drawn in the same stroke style as the lucide-react icons (24x24 viewBox,
 * round caps/joins, currentColor) so it follows the tab colour, the active
 * stroke weight and dark mode like every other icon.
 */
const ValuationIcon = forwardRef<SVGSVGElement, ValuationIconProps>(
  ({ size = 24, strokeWidth = 1.75, color = 'currentColor', ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* page with folded corner */}
      <path d="M13 2H8a2 2 0 0 0-2 2v4.5" />
      <path d="M13 2l6 6v11a2 2 0 0 1-2 2h-5" />
      <path d="M13 2v6h6" />
      {/* bars */}
      <path d="M14.5 18v-3M17 18v-6" />
      {/* magnifier */}
      <circle cx="8" cy="14.5" r="4.5" />
      <path d="M4.8 17.7 2.5 20" />
      {/* dollar sign */}
      <path d="M9.3 13.2c-.3-.3-.8-.5-1.3-.5-.7 0-1.2.4-1.2.9s.5.8 1.2.9 1.2.4 1.2.9-.5.9-1.2.9c-.5 0-1-.2-1.3-.5M8 11.9v.8M8 16.4v.8" strokeWidth={Number(strokeWidth) * 0.6} />
    </svg>
  ),
);
ValuationIcon.displayName = 'ValuationIcon';
export default ValuationIcon;
