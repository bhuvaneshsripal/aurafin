import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from './cn';

export interface TabItem<T extends string = string> {
  key: T;
  label: ReactNode;
  count?: number;
}

const FADE = 44; // px of edge fade that hints "more tabs this way"

/** Underline tabs — page-level sections (Assets / Liabilities / …).
 *
 *  When there are more tabs than fit, the strip can be moved on every device:
 *  - touch / trackpad swipe (native),
 *  - mouse wheel over the strip (vertical wheel scrolls it sideways; at either end the page scrolls as usual),
 *  - click-and-drag with the mouse,
 *  - ◀ ▶ buttons (on devices with a mouse),
 *  - ← → / Home / End keys.
 *  The selected tab is always scrolled into view, and fades on the left/right edge show where more tabs are. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (key: T) => void;
  className?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const drag = useRef({ down: false, startX: 0, startLeft: 0, moved: false });
  const firstScroll = useRef(true);

  const updateEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollWidth - el.scrollLeft - el.clientWidth > 4;
    setEdges((e) => (e.left === left && e.right === right ? e : { left, right }));
  }, []);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    updateEdges();
    el.addEventListener('scroll', updateEdges, { passive: true });
    const ro = new ResizeObserver(updateEdges);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);

    // Mouse wheel: a vertical wheel moves the strip sideways (a laptop mouse has no horizontal wheel).
    // Not at an end in that direction -> let the page scroll normally.
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth + 1) return;
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return; // already a sideways gesture
      const max = el.scrollWidth - el.clientWidth;
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });

    // Click-and-drag with the mouse.
    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d.down) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 5) d.moved = true;
      if (d.moved) el.scrollLeft = d.startLeft - dx;
    };
    const onUp = () => {
      const d = drag.current;
      d.down = false;
      el.style.cursor = '';
      // a drag must not also click the tab it ended on
      if (d.moved) window.setTimeout(() => (d.moved = false), 0);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || el.scrollWidth <= el.clientWidth + 1) return;
      drag.current = { down: true, startX: e.clientX, startLeft: el.scrollLeft, moved: false };
      el.style.cursor = 'grabbing';
    };
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      ro.disconnect();
    };
  }, [items.length, updateEdges]);

  // Keep the selected tab in view (centred), on first show and whenever it changes.
  useEffect(() => {
    const el = scrollerRef.current;
    const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!el || !tab) return;
    const sr = el.getBoundingClientRect();
    const tr = tab.getBoundingClientRect();
    const delta = tr.left - sr.left - (el.clientWidth - tr.width) / 2;
    if (Math.abs(delta) < 2) return;
    el.scrollTo({ left: el.scrollLeft + delta, behavior: firstScroll.current ? 'auto' : 'smooth' });
    firstScroll.current = false;
  }, [value, items.length]);

  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.7, behavior: 'smooth' });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = items.findIndex((t) => t.key === value);
    let next = -1;
    if (e.key === 'ArrowRight') next = Math.min(items.length - 1, i + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(0, i - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = items.length - 1;
    if (next < 0 || next === i) return;
    e.preventDefault();
    onChange(items[next].key);
    window.requestAnimationFrame(() => scrollerRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus());
  };

  const mask =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent, #000 ${FADE}px, #000 calc(100% - ${FADE}px), transparent)`
      : edges.left
        ? `linear-gradient(to right, transparent, #000 ${FADE}px)`
        : edges.right
          ? `linear-gradient(to right, #000 calc(100% - ${FADE}px), transparent)`
          : undefined;

  const arrowCls =
    'absolute top-0 z-10 hidden h-10 w-8 items-center justify-center text-muted hover:text-ink [@media(hover:hover)]:flex';

  return (
    <div className={cn('relative border-b border-line', className)}>
      <div
        ref={scrollerRef}
        className="overflow-x-auto no-scrollbar"
        style={{ maskImage: mask, WebkitMaskImage: mask }}
      >
        <div role="tablist" className="flex gap-1 min-w-max" onKeyDown={onKeyDown}>
          {items.map((t) => {
            const active = t.key === value;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                type="button"
                draggable={false}
                onClick={(e) => {
                  if (drag.current.moved) {
                    e.preventDefault();
                    return;
                  }
                  onChange(t.key);
                }}
                className={cn(
                  'keep-square relative h-10 px-3 text-sm font-medium transition-colors duration-150 border-b-[3px] select-none',
                  active
                    ? 'text-primary-ink border-brand-600 dark:border-brand-400'
                    : 'text-muted border-transparent hover:text-ink'
                )}
              >
                {t.label}
                {t.count !== undefined && (
                  <span className="ml-1.5 text-xs font-normal text-faint">{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      {edges.left && (
        <button type="button" aria-label="Scroll tabs left" tabIndex={-1} onClick={() => nudge(-1)} className={cn(arrowCls, 'left-0')}>
          <ChevronLeft size={16} />
        </button>
      )}
      {edges.right && (
        <button type="button" aria-label="Scroll tabs right" tabIndex={-1} onClick={() => nudge(1)} className={cn(arrowCls, 'right-0')}>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}

/** Small segmented control — ranges (1M · 3M · 1Y), view toggles. */
export function SegmentedControl<T extends string>({
  items,
  value,
  onChange,
  size = 'md',
  className,
}: {
  items: { key: T; label: ReactNode }[];
  value: T;
  onChange: (key: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="group"
      className={cn('inline-flex rounded-full bg-slate-100 dark:bg-slate-800 p-0.5', className)}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(it.key)}
            className={cn(
              'keep-round font-medium transition-colors duration-150',
              size === 'sm' ? 'h-6 px-2.5 text-xs' : 'h-7 px-3 text-[13px]',
              active
                ? 'bg-surface text-primary-ink shadow-sm dark:bg-slate-700'
                : 'text-muted hover:text-ink'
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
