import { useRef } from 'react';
import { Coins, RefreshCw } from 'lucide-react';
import { useLivePricesStore } from '../store/livePricesStore';
import { goldPricePerGram22k } from '../utils/goldPrice';
import { formatCurrency } from '../utils/currency';

/** One purity in its own box: the 1 g price, with the 10 g price right under it. */
function Rate({ label, perGram, dot }: { label: string; perGram: number; dot: string }) {
  return (
    <div className="shrink-0 rounded-xl border-2 border-brand-600 dark:border-brand-400 px-3 py-2 min-w-[150px]">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${dot}`} />
        <span className="text-[13px] font-medium text-muted">{label}</span>
      </div>
      <p className="font-numeric text-base font-semibold text-ink mt-0.5">
        {formatCurrency(perGram, 'INR', { fractionDigits: 2 })}
        <span className="text-xs font-medium text-muted ml-1">/ gram</span>
      </p>
      <p className="font-numeric text-xs text-muted mt-0.5">
        {formatCurrency(perGram * 10, 'INR', { fractionDigits: 0 })}
        <span className="ml-1">/ 10g</span>
      </p>
    </div>
  );
}

/**
 * Live 24K + 22K gold rate on ONE line inside a box that can be moved sideways
 * (swipe on phones, drag or scroll on desktop) when the line is wider than the
 * screen. 24K comes from the live spot feed; 22K is derived at the 22/24 purity
 * ratio — see src/utils/goldPrice.ts. This is a global spot estimate, not an
 * exact local jeweller quote (Settings > Preferences has a rate adjustment %).
 */
export default function GoldPriceCard() {
  const price24k = useLivePricesStore((s) => s.goldPricePerGram);
  const loading = useLivePricesStore((s) => s.goldPriceLoading);
  const error = useLivePricesStore((s) => s.goldPriceError);

  // Mouse drag-to-scroll (touch screens already scroll natively).
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number } | null>(null);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || !ref.current) return;
    drag.current = { x: e.clientX, left: ref.current.scrollLeft };
    ref.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || !ref.current) return;
    ref.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => {
    drag.current = null;
  };

  return (
    <div className="bg-surface border border-line rounded-2xl shadow-xs overflow-hidden px-4 py-3">
      {/* Title row on top */}
      <div className="flex items-center gap-2">
        <span className="text-amber-600 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-1.5 flex items-center justify-center">
          <Coins className="w-4 h-4" />
        </span>
        <h3 className="text-sm font-semibold text-ink">Live gold price</h3>
        {price24k !== null && !loading && (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary-ink">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      {/* Movable one-line row of boxes under the title */}
      <div
        ref={ref}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        aria-label="Live gold price"
        className="no-scrollbar mt-3 flex items-stretch gap-3 overflow-x-auto overscroll-x-contain whitespace-nowrap cursor-grab active:cursor-grabbing select-none"
        style={{ touchAction: 'pan-x pan-y' }}
      >
        {price24k === null && loading && (
          <span className="inline-flex items-center gap-2 text-xs text-muted shrink-0">
            <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fetching live gold rate…
          </span>
        )}
        {price24k === null && !loading && error && (
          <span className="text-xs text-muted shrink-0">Couldn't fetch a live gold rate right now.</span>
        )}
        {price24k !== null && (
          <>
            <Rate label="22K (916)" perGram={goldPricePerGram22k(price24k)} dot="bg-amber-300" />
            <Rate label="24K (999)" perGram={price24k} dot="bg-amber-500" />
          </>
        )}
      </div>
    </div>
  );
}
