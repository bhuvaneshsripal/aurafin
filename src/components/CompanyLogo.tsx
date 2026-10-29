import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useFittedLogo } from '../utils/logoFit';

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
  'SUZLON', 'IDEA', 'CUPID', 'BEL',
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

// Logos that already arrived this session paint instantly (no fade, no
// skeleton) when a row re-renders or scrolls back into view.
const loadedSrcs = new Set<string>();
/** Wait before retry 1, 2, 3. A miss is often just a weak connection or a
 *  busy upstream, so the logo is asked for again instead of giving up. */
const RETRY_DELAYS_MS = [2000, 6000, 15000];

/** Original company logo only — never an invented one. Order: bundled local
 *  logo -> online lookup (/api/market/logo), retried with back-off. While it
 *  loads the slot is a quiet skeleton; if it genuinely can't be found the
 *  slot stays a neutral placeholder icon (no fake initials/colours). */
export default function CompanyLogo({ symbol, name, market = 'IN', isin, size = 32 }: Props) {
  const local = symbol || name ? localLogoFor(symbol ?? '', name) : null;
  const onlineBase = symbol
    ? `/api/market/logo?symbol=${encodeURIComponent(symbol)}&market=${market}${isin ? `&isin=${encodeURIComponent(isin)}` : ''}&name=${encodeURIComponent(name ?? '')}`
    : null;
  // 0 = try local (if any), 1 = online lookup, 2 = gave up
  const [stage, setStage] = useState<0 | 1 | 2>(local ? 0 : onlineBase ? 1 : 2);
  const [attempt, setAttempt] = useState(0);
  const src = stage === 0 ? local : stage === 1 && onlineBase ? (attempt ? `${onlineBase}&r=${attempt}` : onlineBase) : null;
  const [loaded, setLoaded] = useState(() => (src ? loadedSrcs.has(src) : false));
  // Same logo, re-centred and filled edge to edge in its own background colour
  // (no white rims); until it is ready, or if it can't be read, the original shows.
  const fit = useFittedLogo(src);

  // Back-off retry timer, and a fresh start whenever the connection returns.
  useEffect(() => {
    if (stage !== 2 || !onlineBase) return;
    const restart = () => {
      setAttempt(0);
      setStage(1);
    };
    window.addEventListener('online', restart);
    return () => window.removeEventListener('online', restart);
  }, [stage, onlineBase]);

  const onError = () => {
    setLoaded(false);
    if (stage === 0) {
      setStage(onlineBase ? 1 : 2);
      return;
    }
    if (attempt < RETRY_DELAYS_MS.length) {
      const next = attempt + 1;
      window.setTimeout(() => setAttempt(next), RETRY_DELAYS_MS[attempt]);
    } else {
      setStage(2);
    }
  };

  return (
    <span
      className="relative shrink-0 inline-flex items-center justify-center rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white"
      style={{ width: size, height: size, backgroundColor: fit?.bg }}
    >
      {!loaded && !fit && (
        stage === 2 ? (
          <Building2 size={Math.round(size * 0.5)} className="text-slate-300 dark:text-slate-600" aria-hidden />
        ) : (
          <span className="absolute inset-0 animate-pulse bg-slate-100 dark:bg-slate-800" aria-hidden />
        )
      )}
      {src && (
        <img
          key={fit ? 'fit' : src}
          src={fit ? fit.url : src}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => {
            loadedSrcs.add(src);
            setLoaded(true);
          }}
          onError={onError}
          className={`absolute inset-0 w-full h-full ${fit ? 'object-cover' : 'object-contain p-[3px] bg-white'}`}
          style={{ opacity: loaded || fit ? 1 : 0, transition: fit || loadedSrcs.has(src) ? 'none' : 'opacity 200ms ease-out' }}
        />
      )}
    </span>
  );
}
