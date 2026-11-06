import { useLivePricesStore } from '../store/livePricesStore';
import { useIsMarketOpen } from '../utils/marketHours';
import { hardRefresh } from '../utils/hardRefresh';
import { StaleBanner, LastUpdated } from './ui';

const DAY_MS = 24 * 60 * 60_000;

/** When quotes last arrived (null until the first live price). */
function useQuotesUpdatedAt() {
  return useLivePricesStore((s) => s.pricesUpdatedAt ?? s.lastUpdated);
}

/**
 * "Prices updated 2h ago · Refresh". While the market is open, quotes older than
 * 30 minutes count as stale; when it is closed, only quotes older than 3 days do
 * (an overnight or weekend gap is normal, not a warning).
 */
export function PriceStaleBanner({ className }: { className?: string }) {
  const updatedAt = useQuotesUpdatedAt();
  const open = useIsMarketOpen();
  return (
    <StaleBanner
      className={className}
      updatedAt={updatedAt}
      staleAfterMs={open ? 30 * 60_000 : 3 * DAY_MS}
      onRefresh={() => void hardRefresh({ showBar: true, keepPage: true })}
    />
  );
}

/** "↓ Pull to refresh · Updated 12:07 pm" for the foot of the main pages. */
export function PriceUpdatedLine({ className }: { className?: string }) {
  return <LastUpdated className={className} updatedAt={useQuotesUpdatedAt()} />;
}
