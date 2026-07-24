import { useUiStore } from '../store/uiStore';
import { formatCurrency } from '../utils/currency';

interface AmountProps {
  value: number;
  currency?: string;
  className?: string;
}

/**
 * Renders a currency value, or a masked placeholder when privacy mode
 * is on (toggled from the eye icon in the Topbar).
 */
export default function Amount({ value, currency = 'INR', className }: AmountProps) {
  const privacyMode = useUiStore((s) => s.privacyMode);
  if (privacyMode) {
    return <span className={className}>••••••</span>;
  }
  return <span className={className}>{formatCurrency(value, currency)}</span>;
}
