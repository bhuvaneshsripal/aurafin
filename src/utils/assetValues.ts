import type { Asset } from '../types';
import { resolveLivePrice } from '../store/livePricesStore';

export interface ResolvedAssetValues {
  invested: number | undefined;
  currentPrice: number | undefined;
  value: number;
  pnl: number | undefined;
  pnlPercent: number | undefined;
  isLive: boolean;
}

/** Compute display values for an asset, applying live LTP when available. */
export function resolveAssetValues(
  asset: Asset,
  livePrices: Record<string, number>
): ResolvedAssetValues {
  const livePrice = resolveLivePrice(asset.symbol, livePrices);
  const isLive = livePrice !== undefined;

  const currentPrice =
    livePrice ??
    (asset.quantity && asset.quantity > 0 ? asset.value / asset.quantity : undefined);

  const invested =
    asset.investedValue ??
    (asset.quantity && asset.avgCost && asset.quantity > 0 && asset.avgCost > 0
      ? asset.quantity * asset.avgCost
      : undefined);

  const value =
    isLive && asset.quantity && asset.quantity > 0
      ? asset.quantity * livePrice!
      : asset.value;

  const pnl = invested !== undefined ? value - invested : asset.pnl;
  const pnlPercent =
    pnl !== undefined && invested && invested > 0 ? (pnl / invested) * 100 : asset.pnlPercent;

  return { invested, currentPrice, value, pnl, pnlPercent, isLive };
}
