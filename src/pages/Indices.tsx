import { useEffect, useId, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import IndicesTable, { type IndicesVariant } from '../components/IndicesTable';
import { MAP_BORDERS, MAP_COUNTRIES, MAP_GLOBE, MAP_LAND, MAP_VIEWBOX } from '../utils/worldMapPaths';
import { cn } from '../components/ui/cn';
import { readCache, writeCache, CACHE_NAMES } from '../utils/fetchCache';

const TABS: { key: IndicesVariant; label: string }[] = [
  { key: 'indian', label: 'Indian Indices' },
  { key: 'global', label: 'Global Indices' },
];

const UP = '#00b386';
const DOWN = '#f0572d';
// Markets with no country shape of their own are drawn on their parent.
const MAP_CODE: Record<string, string> = { HK: 'CN' };

/** Per-country colour for the Global tab: green if its indices are net up today, orange if down. */
function colorsFrom(indices: { region?: string; price: number; previousClose?: number }[]): Record<string, string> {
  const sum: Record<string, number> = {};
  for (const r of indices) {
    if (!r.region || !r.previousClose) continue;
    const code = MAP_CODE[r.region] ?? r.region;
    sum[code] = (sum[code] ?? 0) + (r.price - r.previousClose) / r.previousClose;
  }
  return Object.fromEntries(Object.entries(sum).map(([c, v]) => [c, v >= 0 ? UP : DOWN]));
}

function useGlobalMarketColors(enabled: boolean) {
  // Start from the last saved data so the map is coloured even with no network.
  const [colors, setColors] = useState<Record<string, string>>(() => {
    const c = readCache<{ region?: string; price: number; previousClose?: number }[]>(CACHE_NAMES.global);
    return c ? colorsFrom(c.data) : {};
  });
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch('/api/market/global-indices');
        const json = await res.json();
        if (cancelled || !Array.isArray(json?.indices)) return;
        writeCache(CACHE_NAMES.global, json.indices);
        setColors(colorsFrom(json.indices));
      } catch {
        /* keep whatever was drawn last */
      }
    };
    load();
    const id = window.setInterval(() => document.visibilityState === 'visible' && load(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [enabled]);
  return colors;
}

/** All Indices — world-map header (India highlighted), then Indian / Global tabs. */
export default function Indices() {
  const [params, setParams] = useSearchParams();
  const tab: IndicesVariant = params.get('tab') === 'global' ? 'global' : 'indian';
  const clipId = useId();
  const globalColors = useGlobalMarketColors(tab === 'global');
  const highlights: Record<string, string> = tab === 'global' ? globalColors : { IN: DOWN };

  return (
    <div className="space-y-5">
      <div className="relative h-[clamp(170px,22vw,290px)] overflow-hidden -mx-4 sm:-mx-6 md:-mx-8 -mt-5 sm:-mt-6 md:-mt-7">
        <svg
          viewBox={MAP_VIEWBOX}
          preserveAspectRatio="xMidYMin slice"
          className="absolute inset-x-0 top-0 h-full w-full"
          aria-hidden="true"
        >
          <defs>
            <clipPath id={clipId}>
              <path d={MAP_GLOBE} />
            </clipPath>
          </defs>
          <path d={MAP_GLOBE} className="fill-sky-50/70 dark:fill-slate-800/30" />
          <g clipPath={`url(#${clipId})`}>
            <path d={MAP_LAND} className="fill-sky-100 dark:fill-slate-700/50" />
            <path d={MAP_BORDERS} fill="none" strokeWidth="0.5" className="stroke-sky-50 dark:stroke-slate-800/60" />
            {Object.entries(highlights).map(([code, fill]) =>
              MAP_COUNTRIES[code] ? <path key={code} d={MAP_COUNTRIES[code]} fill={fill} style={{ transition: 'fill .3s' }} /> : null
            )}
          </g>
        </svg>
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[var(--color-page,transparent)] pointer-events-none" />
        <h1 className="relative px-4 sm:px-6 md:px-8 pt-7 text-2xl sm:text-[28px] font-semibold text-ink tracking-tight">
          All Indices
        </h1>
      </div>

      <div className="bg-surface rounded-2xl border border-line overflow-hidden">
        <div role="tablist" className="flex gap-2 px-3 sm:px-4 bg-surface-muted border-b border-line">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                onClick={() => setParams(t.key === 'indian' ? {} : { tab: t.key }, { replace: true })}
                className={cn(
                  'keep-square relative -mb-px px-3 sm:px-4 py-3.5 text-[15px] font-medium border-b-2 transition-colors',
                  active
                    ? 'text-brand-700 dark:text-brand-300 border-brand-600'
                    : 'text-muted border-transparent hover:text-ink'
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>
        <IndicesTable key={tab} variant={tab} />
      </div>
    </div>
  );
}
