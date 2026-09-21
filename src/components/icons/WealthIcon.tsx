import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface WealthIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Custom nav icon for the Wealth section: a rupee coin with an upward
 * growth arrow, drawn in the same stroke style as the lucide-react icon
 * set used elsewhere in the app (24x24 viewBox, round caps/joins) so it
 * drops in wherever a lucide icon is expected (BottomNav, Sidebar, etc.)
 */
const WealthIcon = forwardRef<SVGSVGElement, WealthIconProps>(
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
      <circle cx="9" cy="16" r="6.25" />
      <g transform="translate(3,10.5) scale(0.5)">
        <path d="M6 3h12" />
        <path d="M6 8h12" />
        <path d="m6 13 8.5 8" />
        <path d="M6 13h3" />
        <path d="M9 13c6.667 0 6.667-10 0-10" />
      </g>
      <path d="M15.5 8.5 21.5 2.5" />
      <path d="M21.5 6.8V2.5h-4.3" />
    </svg>
  )
);

WealthIcon.displayName = 'WealthIcon';

export default WealthIcon;
