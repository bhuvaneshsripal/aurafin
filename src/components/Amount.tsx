import { useUiStore } from '../store/uiStore';
import { maskAmount } from '../utils/currency';

interface AmountProps {
  value: number;
  currency?: string;
  className?: string;
}

/**
 * Renders a currency value, or a masked placeholder when privacy mode
 * is on (toggled from the eye icon in the Topbar). A zero amount is
 * never masked — there's nothing to hide, so it always shows as 0.
 */
export default function Amount({ value, currency = 'INR', className }: AmountProps) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  return <span className={className}>{maskAmount(value, currency, privacyMode)}</span>;
}
