import { forwardRef } from 'react';
import type { SVGProps } from 'react';

interface MoneyIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string;
}

/**
 * Custom nav icon for the Money section: a drawstring money bag with a
 * rupee sign, drawn in the same stroke style as the lucide-react icon
 * set (24x24 viewBox, round caps/joins) so it drops in wherever a lucide
 * icon is expected (BottomNav, Sidebar, etc.)
 */
const MoneyIcon = forwardRef<SVGSVGElement, MoneyIconProps>(
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
      <path d="M9.5 3.5c1 1 3 1 4.5 0" />
      <path d="M9 5.5h6" />
      <path d="M9.5 5.8c-2.2 2-4 4.7-4 8a6.5 6.5 0 0 0 13 0c0-3.3-1.8-6-4-8" />
      <g transform="translate(5.5,8.3) scale(0.46)">
        <path d="M6 3h12" />
        <path d="M6 8h12" />
        <path d="m6 13 8.5 8" />
        <path d="M6 13h3" />
        <path d="M9 13c6.667 0 6.667-10 0-10" />
      </g>
    </svg>
  )
);

MoneyIcon.displayName = 'MoneyIcon';

export default MoneyIcon;
