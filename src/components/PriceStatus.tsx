import { useLivePricesStore } from '../store/livePricesStore';
import { LastUpdated } from './ui';

/** When quotes last arrived (null until the first live price). */
function useQuotesUpdatedAt() {
  return useLivePricesStore((s) => s.pricesUpdatedAt ?? s.lastUpdated);
}

/** "↓ Pull to refresh · Updated 12:07 pm" for the foot of the main pages. */
export function PriceUpdatedLine({ className }: { className?: string }) {
  return <LastUpdated className={className} updatedAt={useQuotesUpdatedAt()} />;
}
