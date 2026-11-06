import { usePriceTrailStore } from '../store/priceTrailStore';
import { Sparkline } from './ui';

/**
 * Tiny trend beside a holding's % change: yesterday's close, then the prices seen
 * this session, then the current price. Draws nothing until there are at least
 * two points (e.g. manual holdings with no live quote).
 */
export default function HoldingSparkline({
  symbol,
  previousClose,
  price,
  className,
}: {
  symbol?: string;
  previousClose?: number;
  price?: number;
  className?: string;
}) {
  const trail = usePriceTrailStore((s) => (symbol ? s.trail[symbol.toUpperCase()] : undefined));
  const pts: number[] = [];
  if (previousClose !== undefined) pts.push(previousClose);
  if (trail) pts.push(...trail);
  if (price !== undefined && pts[pts.length - 1] !== price) pts.push(price);
  if (pts.length < 2) return null;
  return <Sparkline values={pts} className={className} label={`${symbol ?? 'Holding'} recent trend`} />;
}
