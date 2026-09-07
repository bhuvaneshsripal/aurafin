import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { CURRENCIES, CURRENCY_SYMBOLS } from '../utils/currency';

interface CurrencySelectProps {
  value: string;
  onChange: (currency: string) => void;
  /** Styling for the closed trigger — pass the same `inputClass` string
   *  used for the field it's replacing so it lines up with sibling inputs. */
  className?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Drop-in replacement for `<select value onChange>{CURRENCIES.map...}</select>`
 * that renders a fully custom popover instead of the browser's native
 * <select> UI (which looks/behaves differently per browser/OS and can't be
 * restyled). Same controlled value/onChange contract as a native select, so
 * existing currency state and calculations are untouched — only the
 * interaction/markup changes.
 *
 * The menu is portaled to <body> and positioned with `fixed` coordinates
 * measured from the trigger's bounding rect, so it always renders on top
 * (z-[1000], above modals at z-50) and is never clipped by an ancestor's
 * `overflow-hidden`/`overflow-y-auto` (e.g. the scrollable Modal body) or a
 * transformed/stacking-context ancestor — the two things that break a
 * plain `position: absolute` dropdown in this app's modal-heavy forms.
 */
export default function CurrencySelect({ value, onChange, className = '', disabled, id }: CurrencySelectProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    openUp: false,
  });
  // Keyboard-focused row while the menu is open (arrow-key navigation) —
  // starts on whichever currency is currently selected.
  const [activeIndex, setActiveIndex] = useState(() => CURRENCIES.indexOf(value as (typeof CURRENCIES)[number]));
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const reposition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const menuMaxHeight = 288; // keep in sync with max-h-72 below
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuMaxHeight + 12 && rect.top > spaceBelow;
    setCoords({
      top: openUp ? rect.top : rect.bottom,
      left: rect.left,
      width: rect.width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    setActiveIndex(CURRENCIES.indexOf(value as (typeof CURRENCIES)[number]));
    reposition();
    // Capture-phase so scrolling inside any nested scroll container (e.g.
    // the Modal's scrollable body) also repositions the menu, not just
    // window-level scroll.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, CURRENCIES.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const c = CURRENCIES[activeIndex];
        if (c) {
          onChange(c);
          setOpen(false);
          triggerRef.current?.focus();
        }
      } else if (e.key === 'Tab') {
        setOpen(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, activeIndex, onChange]);

  // Keep the keyboard-active row scrolled into view as it changes.
  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const selectedSymbol = CURRENCY_SYMBOLS[value] ?? '';

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (open) return; // document-level handler above takes over once open
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">
          {value}
          {selectedSymbol && <span className="text-slate-400 dark:text-slate-500 ml-1">{selectedSymbol}</span>}
        </span>
        <ChevronDown
          size={15}
          className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            className={`animate-menu-in fixed z-[1000] max-h-72 overflow-y-auto bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-1.5 ${
              coords.openUp ? '-translate-y-full' : ''
            }`}
            style={{ top: coords.top, left: coords.left, width: Math.max(coords.width, 128) }}
          >
            {CURRENCIES.map((c, i) => {
              const selected = c === value;
              const active = i === activeIndex;
              return (
                <button
                  key={c}
                  ref={(el) => {
                    optionRefs.current[i] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActiveIndex(i)}
                  onClick={() => {
                    onChange(c);
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-sm transition-colors ${
                    selected
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium'
                      : active
                        ? 'bg-slate-50 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                        : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 truncate">
                    <span>{c}</span>
                    <span className="text-slate-400 dark:text-slate-500">{CURRENCY_SYMBOLS[c]}</span>
                  </span>
                  {selected && <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
