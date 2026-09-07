import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface CustomSelectOption {
  value: string;
  /** What's shown for this row (and, unless `triggerLabel` is set, in the
   *  closed trigger too). Can be plain text or richer content (e.g. an
   *  icon + label pair). */
  label: ReactNode;
  disabled?: boolean;
  /** Optional group name — consecutive options sharing a group get a small
   *  non-interactive header above them (replaces native <optgroup>). */
  group?: string;
}

interface CustomSelectProps {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  /** Styling for the closed trigger — pass the same class string the
   *  native `<select>` it's replacing used, so it lines up with sibling
   *  inputs pixel-for-pixel. */
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  /** Alignment of the menu's left/right edge to the trigger. Defaults to
   *  'left' (menu's left edge lines up with the trigger's left edge). */
  align?: 'left' | 'right';
  /** Menu width in px. Defaults to the trigger's own width. */
  menuWidth?: number;
  /** Opens the menu as soon as this component mounts — for call sites that
   *  swap a static chip/button for this select and want it to behave like
   *  the native `<select autoFocus>` it replaced (immediately open). */
  defaultOpen?: boolean;
  /** Notified whenever the menu opens/closes — lets a call site that only
   *  mounts this component while "editing" (e.g. a chip → picker toggle)
   *  unmount it again once the menu closes, mirroring the old select's
   *  onBlur-closes behavior. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Generic, fully custom dropdown — the same portaled/positioned/keyboard-
 * navigable popover pattern as CurrencySelect, but for any list of
 * value/label options. This is the app-wide replacement for native
 * `<select>` elements: identical look and interaction across every browser/
 * OS, instead of inheriting whatever the platform's native picker looks
 * like.
 *
 * Drop-in for `<select value onChange>{options.map(...)}</select>` — same
 * controlled value/onChange contract, so existing state and calculations
 * at every call site are untouched; only the interaction/markup changes.
 */
export default function CustomSelect({
  value,
  options,
  onChange,
  className = '',
  placeholder,
  disabled,
  id,
  align = 'left',
  menuWidth,
  defaultOpen = false,
  onOpenChange,
}: CustomSelectProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; openUp: boolean }>({
    top: 0,
    left: 0,
    width: 0,
    openUp: false,
  });
  const [activeIndex, setActiveIndex] = useState(() => options.findIndex((o) => o.value === value));
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
    const width = menuWidth ?? rect.width;
    setCoords({
      top: openUp ? rect.top : rect.bottom,
      left: align === 'right' ? rect.right - width : rect.left,
      width,
      openUp,
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    setActiveIndex(options.findIndex((o) => o.value === value));
    reposition();
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
        setActiveIndex((i) => {
          let next = i;
          do {
            next = Math.min(next + 1, options.length - 1);
          } while (options[next]?.disabled && next < options.length - 1);
          return next;
        });
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => {
          let next = i;
          do {
            next = Math.max(next - 1, 0);
          } while (options[next]?.disabled && next > 0);
          return next;
        });
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        const opt = options[activeIndex];
        if (opt && !opt.disabled) {
          onChange(opt.value);
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
  }, [open, activeIndex, onChange, options]);

  useEffect(() => {
    onOpenChange?.(open);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const selected = options.find((o) => o.value === value);

  return (
    <>
      <button
        type="button"
        id={id}
        ref={triggerRef}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => {
          if (open) return;
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setOpen(true);
          }
        }}
        className={`${className} flex items-center justify-between gap-2 text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-60`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={`truncate ${!selected ? 'text-slate-400' : ''}`}>
          {selected ? selected.label : placeholder ?? ''}
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
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            {options.length === 0 && (
              <div className="px-3.5 py-2 text-sm text-slate-400 dark:text-slate-500">No options</div>
            )}
            {options.map((opt, i) => {
              const isSelected = opt.value === value;
              const active = i === activeIndex;
              const showGroupHeader = opt.group && opt.group !== options[i - 1]?.group;
              return (
                <div key={opt.value}>
                  {showGroupHeader && (
                    <div
                      className={`px-3.5 pt-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 ${
                        i > 0 ? 'mt-1 border-t border-slate-100 dark:border-slate-700' : ''
                      }`}
                    >
                      {opt.group}
                    </div>
                  )}
                  <button
                    ref={(el) => {
                      optionRefs.current[i] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(i)}
                    onClick={() => {
                      if (opt.disabled) return;
                      onChange(opt.value);
                      setOpen(false);
                      triggerRef.current?.focus();
                    }}
                    className={`w-full flex items-center justify-between gap-2 px-3.5 py-2 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium'
                        : active
                          ? 'bg-slate-50 dark:bg-slate-700/60 text-slate-700 dark:text-slate-200'
                          : 'text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    <span className="truncate text-left">{opt.label}</span>
                    {isSelected && <Check size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />}
                  </button>
                </div>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}
