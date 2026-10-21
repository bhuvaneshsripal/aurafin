import { useState } from 'react';

interface Props {
  symbol?: string;
  name: string;
  market?: 'IN' | 'US';
  isin?: string;
  size?: number;
}

/** Hand-picked logos bundled in /public/company-logos. Checked first, so a
 *  stock whose logo the online lookup can't find still shows the right one.
 *  To add another: drop <SYMBOL>.png in that folder and list it here. */
const LOCAL_LOGOS = new Set([
  'SUZLON', 'IDEA', 'CUPID',
  'ADANI', 'ADANIPOWER', 'ADANIENT', 'ADANIPORTS', 'ADANIGREEN', 'ADANIENSOL', 'ADANITRANS', 'ADANIWILMAR', 'ADANIGAS', 'ATGL',
]);

function localLogoFor(symbol: string, name: string): string | null {
  const sym = symbol.toUpperCase().replace(/\.(NS|BO)$/i, '');
  const n = name.toUpperCase();
  const key = sym.startsWith('ADANI') || n.startsWith('ADANI') ? 'ADANI'
    : sym === 'VODAFONEIDEA' || n.includes('VODAFONE IDEA') ? 'IDEA'
    : n.startsWith('SUZLON') ? 'SUZLON'
    : n.startsWith('CUPID') ? 'CUPID'
    : sym;
  return LOCAL_LOGOS.has(key) ? `/company-logos/${key}.png` : null;
}

/** Original company logo. Order: bundled local logo -> online lookup
 *  (/api/market/logo) -> neutral initials badge. Never a fake logo. */
export default function CompanyLogo({ symbol, name, market = 'IN', isin, size = 32 }: Props) {
  const local = symbol || name ? localLogoFor(symbol ?? '', name) : null;
  // 0 = try local (if any), 1 = online, 2 = initials
  const [stage, setStage] = useState<0 | 1 | 2>(local ? 0 : 1);
  const box = { width: size, height: size };
  const online = symbol
    ? `/api/market/logo?symbol=${encodeURIComponent(symbol)}&market=${market}${isin ? `&isin=${encodeURIComponent(isin)}` : ''}`
    : null;
  const src = stage === 0 ? local : stage === 1 ? online : null;
  if (src) {
    return (
      <span
        className="shrink-0 inline-flex items-center justify-center rounded-lg bg-white border border-slate-200 dark:border-slate-700 overflow-hidden"
        style={box}
      >
        <img
          key={src}
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setStage(stage === 0 && online ? 1 : 2)}
          className="w-full h-full object-contain p-[3px]"
        />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 inline-flex items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold"
      style={box}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase() || '•'}
    </span>
  );
}
