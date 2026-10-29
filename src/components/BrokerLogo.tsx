import { useState } from 'react';
import { useFittedLogo } from '../utils/logoFit';

/** Website of each broker — used to fetch its own brand icon when no local file is provided. */
const BROKER_DOMAINS: Record<string, string | string[]> = {
  zerodha: 'zerodha.com',
  groww: 'groww.in',
  indmoney: 'indmoney.com',
  upstox: 'upstox.com',
  icici: ['icicidirect.com', 'www.icicidirect.com', 'icicisecurities.com', 'icici.com'],
  cdsl: ['cdslindia.com', 'www.cdslindia.com', 'web.cdslindia.com'],
  angelone: 'angelone.in',
  aionion: 'aionioncapital.com',
  chola: 'cholasecurities.com',
  mstock: ['mstock.com', 'www.mstock.com', 'trade.mstock.com', 'miraeassetcm.com', 'miraeasset.com'],
  '5paisa': '5paisa.com',
  vested: 'vestedfinance.com',
  tickertape: 'tickertape.in',
  stockal: 'stockal.com',
  ibkr: 'interactivebrokers.com',
  kuvera: ['kuvera.in', 'www.kuvera.in'],
  mfcentral: 'mfcentral.com',
};

/**
 * The broker's real logo, never an invented one. Order:
 *   1. /broker-logos/<key>.png  (drop the official file there to override — see the README in that folder)
 *   2. the broker's own website icon
 *   3. the coloured initial badge, so a card is never empty or broken.
 */
export default function BrokerLogo({
  brokerKey,
  initial,
  color,
  size = 24,
}: {
  brokerKey: string;
  initial: string;
  color: string;
  size?: number;
}) {
  const domains = ([] as string[]).concat(BROKER_DOMAINS[brokerKey] ?? []);
  const sources = [
    `/broker-logos/${brokerKey}.png`,
    `/broker-logos/${brokerKey}.svg`,
    ...domains.flatMap((d) => [
      `https://www.google.com/s2/favicons?domain=${d}&sz=128`,
      `https://${d}/apple-touch-icon.png`,
      `https://${d}/favicon.ico`,
    ]),
  ];
  const [stage, setStage] = useState(0);
  const src = sources[stage];
  const fit = useFittedLogo(src);

  if (!src) {
    return (
      <span
        className="rounded-md flex items-center justify-center text-white text-xs font-bold shrink-0"
        style={{ width: size, height: size, backgroundColor: color }}
      >
        {initial}
      </span>
    );
  }

  return (
    <span
      className="inline-flex shrink-0 overflow-hidden rounded-md bg-white"
      style={{ width: size, height: size, backgroundColor: fit?.bg }}
    >
      <img
        key={fit ? 'fit' : src}
        src={fit ? fit.url : src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setStage((s) => s + 1)}
        onLoad={(e) => {
          // The icon service answers unknown sites with a tiny generic globe; treat that as "not found".
          if (stage > 0 && e.currentTarget.naturalWidth <= 16 && e.currentTarget.src.includes('google.com/s2/favicons')) setStage((s) => s + 1);
        }}
        className={`${fit ? 'object-cover' : 'object-contain p-0.5'} w-full h-full`}
        style={{ width: size, height: size }}
      />
    </span>
  );
}
