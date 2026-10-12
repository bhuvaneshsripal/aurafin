import { useState } from 'react';
import {
  Activity, BarChart3, Building2, Car, Coins, Cpu, Gem, Landmark, Layers, Pill, ShoppingCart,
  Sprout, Tv, TrendingUp, Wallet, type LucideIcon,
} from 'lucide-react';
import { cn } from './ui/cn';

/** Icon per index (matched on the row key); falls back to a generic chart. */
const ICONS: Record<string, LucideIcon> = {
  niftypvtbank: Landmark,
  psubank: Landmark,
  niftybank: Landmark,
  bankex: Landmark,
  niftymetal: Gem,
  midcapselect: Layers,
  midcap100: Layers,
  midcap150: Layers,
  midcap50: Layers,
  bsemidcap: Layers,
  smallcap250: Layers,
  smallcap100: Layers,
  bsesmallcap: Layers,
  niftypharma: Pill,
  niftyit: Cpu,
  nifty50: TrendingUp,
  nifty100: TrendingUp,
  nifty500: TrendingUp,
  next50: TrendingUp,
  bse100: TrendingUp,
  sensex: TrendingUp,
  totalmarket: BarChart3,
  indiavix: Activity,
  media: Tv,
  auto: Car,
  fmcg: ShoppingCart,
  realty: Building2,
  commodities: Coins,
  bseipo: Sprout,
  finnifty: Wallet,
};

const tile = 'h-9 w-9 shrink-0 rounded-lg border border-line flex items-center justify-center overflow-hidden';

/**
 * Logo tile for an index row. Looks for real logo files in public/index-logos/:
 *   1. {indexKey}.png   (e.g. nifty50.png, bankex.png) — a logo for that one index
 *   2. nse.png / bse.png — the exchange logo, shared by its indices
 * and falls back to a generic icon if neither file exists.
 */
export default function IndexIcon({ indexKey, exchange }: { indexKey: string; exchange?: string }) {
  const bse = exchange === 'BSE';
  const sources = [`/index-logos/${indexKey}.png`, `/index-logos/${bse ? 'bse' : 'nse'}.png`];
  const [step, setStep] = useState(0); // which source we're on; sources.length = none found

  if (step < sources.length) {
    return (
      <span className={cn(tile, 'bg-white')}>
        <img
          src={sources[step]}
          alt=""
          className="h-full w-full object-contain p-1"
          onError={() => setStep((n) => n + 1)}
        />
      </span>
    );
  }

  const Icon = ICONS[indexKey] ?? BarChart3;
  return (
    <span
      className={cn(
        tile,
        bse
          ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
          : 'bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300'
      )}
      aria-hidden="true"
    >
      <Icon size={18} strokeWidth={2} />
    </span>
  );
}
