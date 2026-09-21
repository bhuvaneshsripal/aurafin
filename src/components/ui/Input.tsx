import { useEffect, useRef } from 'react';
import type { InputHTMLAttributes, LabelHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/** Walks up from a node to find the nearest scrollable ancestor (a modal body,
 *  a scrollable panel, etc). Falls back to the window/page itself. */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = getComputedStyle(node);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight;
    if (canScrollY) return node;
    node = node.parentElement;
  }
  return null;
}

/** Number inputs change their value on scroll by default while focused — this
 *  redirects that scroll to move the page/container instead, like any other
 *  element. Attached as a real (non-passive) DOM listener because React's
 *  onWheel is passive and can't call preventDefault(). */
function useDisableNumberInputScroll(inputRef: React.RefObject<HTMLInputElement | null>, isNumber: boolean) {
  useEffect(() => {
    const el = inputRef.current;
    if (!el || !isNumber) return;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const scrollParent = findScrollParent(el);
      if (scrollParent) {
        scrollParent.scrollTop += e.deltaY;
        scrollParent.scrollLeft += e.deltaX;
      } else {
        window.scrollBy({ top: e.deltaY, left: e.deltaX });
      }
    };

    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [inputRef, isNumber]);
}

/** Shared field look: white, hairline border, 8px radius, 36px tall. The green
 *  focus border/ring comes from the global `:focus` rule in index.css. */
/** Field surface without any sizing — safe inside flex rows. 16px text on phones
 *  (iOS Safari zooms the page on focus for anything smaller), 14px from `sm` up. */
export const fieldBase =
  'border border-line bg-surface text-base sm:text-sm text-ink placeholder:text-faint rounded-lg px-3 ' +
  'transition-colors duration-150 hover:border-slate-300 disabled:opacity-60 disabled:bg-surface-muted ' +
  'disabled:hover:border-line';

/** Standard full-width text field: 40px tall on phones, 36px on desktop. The green
 *  focus border/ring comes from the global `:focus` rule in index.css. */
export const inputClasses = `w-full min-h-10 sm:min-h-9 py-1.5 ${fieldBase}`;

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  invalid?: boolean;
  /** Icon shown inside the left edge (e.g. a search glass). */
  leftIcon?: ReactNode;
  /** Short text inside the left edge (e.g. ₹). */
  prefix?: ReactNode;
  ref?: Ref<HTMLInputElement>;
}

export default function Input({ invalid, leftIcon, prefix, className, ref, ...rest }: InputProps) {
  const adornment = leftIcon ?? prefix;
  const localRef = useRef<HTMLInputElement | null>(null);
  useDisableNumberInputScroll(localRef, rest.type === 'number');

  return (
    <div className="relative w-full">
      {adornment && (
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted text-sm">
          {adornment}
        </span>
      )}
      <input
        ref={(node) => {
          localRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }}
        aria-invalid={invalid || undefined}
        className={cn(inputClasses, adornment && 'pl-9', invalid && 'border-red-400 hover:border-red-400', className)}
        {...rest}
      />
    </div>
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({ invalid, className, ref, ...rest }: TextareaProps) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn('w-full py-2 min-h-[88px] leading-relaxed resize-y', fieldBase, invalid && 'border-red-400', className)}
      {...rest}
    />
  );
}

export function Label({ className, children, ...rest }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label className={cn('block text-[13px] font-medium text-ink-2 mb-1.5', className)} {...rest}>
      {children}
    </label>
  );
}

/** Label + control + optional hint/error, stacked with consistent spacing. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  error?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      {label && <Label htmlFor={htmlFor}>{label}</Label>}
      {children}
      {error ? (
        <p className="text-xs text-negative mt-1.5">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted mt-1.5">{hint}</p>
      ) : null}
    </div>
  );
}
