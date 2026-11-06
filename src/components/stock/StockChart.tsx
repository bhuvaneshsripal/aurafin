import { useEffect, useMemo, useRef, useState } from 'react';
import { fmtPrice, pointTimeLabel, type Candle, type Market, type RangeKey } from '../../utils/stockDetail';

export const STOCK_UP = '#00b386';
export const STOCK_DOWN = '#eb5b3c';

const PAD_TOP = 34; // room for the value + time shown above the crosshair
const PAD_BOTTOM = 2;

interface Props {
  points: Candle[];
  /** Dashed reference line: yesterday's close on 1D, the first price of the range otherwise. */
  baseline: number | null;
  range: RangeKey;
  market: Market;
  timezone: string;
  mode: 'line' | 'candle';
  height: number;
}

/** The price chart: a plain line (green when up over the range, orange-red when down) with a
 *  dashed reference line, or candles. Hover / drag shows a crosshair with the price and time. */
export default function StockChart({ points, baseline, range, market, timezone, mode, height }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.max(200, el.clientWidth)));
    ro.observe(el);
    setWidth(Math.max(200, el.clientWidth));
    return () => ro.disconnect();
  }, []);

  // A new range / stock starts with no crosshair.
  useEffect(() => setHover(null), [range, points]);

  const geo = useMemo(() => {
    const n = points.length;
    const lows = mode === 'candle' ? points.map((p) => p[3]) : points.map((p) => p[4]);
    const highs = mode === 'candle' ? points.map((p) => p[2]) : points.map((p) => p[4]);
    let lo = Math.min(...lows);
    let hi = Math.max(...highs);
    if (baseline !== null) {
      lo = Math.min(lo, baseline);
      hi = Math.max(hi, baseline);
    }
    if (hi === lo) {
      hi += 1;
      lo -= 1;
    }
    const pad = (hi - lo) * 0.06;
    lo -= pad;
    hi += pad;
    const plotH = height - PAD_TOP - PAD_BOTTOM;
    const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * width);
    const y = (v: number) => PAD_TOP + (1 - (v - lo) / (hi - lo)) * plotH;
    return { n, x, y };
  }, [points, baseline, mode, width, height]);

  const first = baseline ?? points[0]?.[4] ?? 0;
  const last = points[points.length - 1]?.[4] ?? 0;
  const color = last >= first ? STOCK_UP : STOCK_DOWN;

  const linePath = useMemo(
    () => points.map((p, i) => `${i === 0 ? 'M' : 'L'}${geo.x(i).toFixed(1)},${geo.y(p[4]).toFixed(1)}`).join(' '),
    [points, geo]
  );

  const onMove = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || geo.n < 2) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setHover(Math.round(ratio * (geo.n - 1)));
  };

  const hp = hover !== null ? points[hover] : null;
  const hx = hover !== null ? geo.x(hover) : 0;
  const alignRight = hx > width * 0.62;

  return (
    <div
      ref={wrapRef}
      className="relative select-none"
      style={{ height, touchAction: 'pan-y' }}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerDown={(e) => onMove(e.clientX)}
      onPointerLeave={() => setHover(null)}
      onPointerCancel={() => setHover(null)}
    >
      <svg width={width} height={height} className="block overflow-visible" role="img" aria-label="Price chart">
        {/* axis line along the bottom */}
        <line x1={0} x2={width} y1={height - 1} y2={height - 1} stroke="var(--color-line)" strokeWidth={1} />

        {baseline !== null && (
          <line
            x1={0}
            x2={width}
            y1={geo.y(baseline)}
            y2={geo.y(baseline)}
            stroke="var(--color-faint)"
            strokeOpacity={0.45}
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        )}

        {mode === 'line' ? (
          <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          points.map((p, i) => {
            const up = p[4] >= p[1];
            const c = up ? STOCK_UP : STOCK_DOWN;
            const cx = geo.x(i);
            const bw = Math.max(1, Math.min(14, (width / geo.n) * 0.62));
            const top = geo.y(Math.max(p[1], p[4]));
            const bot = geo.y(Math.min(p[1], p[4]));
            return (
              <g key={i}>
                <line x1={cx} x2={cx} y1={geo.y(p[2])} y2={geo.y(p[3])} stroke={c} strokeWidth={1} />
                <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, bot - top)} fill={c} />
              </g>
            );
          })
        )}

        {hp && (
          <>
            <line x1={hx} x2={hx} y1={PAD_TOP - 8} y2={height - 1} stroke="var(--color-line)" strokeWidth={1.5} />
            {mode === 'line' && (
              <>
                <circle cx={hx} cy={geo.y(hp[4])} r={8} fill={color} fillOpacity={0.18} />
                <circle cx={hx} cy={geo.y(hp[4])} r={3.5} fill={color} />
              </>
            )}
          </>
        )}
      </svg>

      {hp && (
        <div
          className="pointer-events-none absolute top-0 whitespace-nowrap text-[13px] leading-5 text-ink-2"
          style={alignRight ? { right: width - hx, paddingRight: 6 } : { left: hx, paddingLeft: 2 }}
        >
          <span className="font-semibold text-ink font-numeric">{fmtPrice(hp[4], market)}</span>
          <span className="mx-1 text-faint">|</span>
          <span className="text-muted">{pointTimeLabel(hp[0], range, timezone)}</span>
          {mode === 'candle' && (
            <div className="text-[11px] text-muted font-numeric">
              O {hp[1].toFixed(2)} · H {hp[2].toFixed(2)} · L {hp[3].toFixed(2)} · C {hp[4].toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
