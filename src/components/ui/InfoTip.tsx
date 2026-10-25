import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';

/**
 * Small "i" button that reveals longer explanatory text.
 * Use it instead of printing helper/description paragraphs under labels and
 * section titles, so forms stay clean and the detail is one click (or hover) away.
 *
 *   <InfoTip>Sets the 15-year term, loan and withdrawal windows.</InfoTip>
 *
 * Opens only on click/tap; click the "i" again, click anywhere else, or press Esc to hide it. Works with mouse, keyboard (focus, Enter/Space, Esc) and touch (tap).
 * The popover is rendered in a portal, so it is never clipped by overflow containers.
 */
export default function InfoTip({
  children,
  label = 'More info',
  size = 14,
  className = '',
}: {
  children: ReactNode;
  label?: string;
  size?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; above: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const place = () => {
    const b = btnRef.current?.getBoundingClientRect();
    if (!b) return;
    const w = Math.min(288, window.innerWidth - 16);
    const h = tipRef.current?.offsetHeight ?? 0;
    let left = b.left + b.width / 2 - w / 2;
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8));
    const above = b.bottom + h + 12 > window.innerHeight && b.top - h - 12 > 0;
    setPos({ left, top: above ? b.top - 8 : b.bottom + 8, above });
  };

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // re-measure once the popover has its real height
    const r = requestAnimationFrame(place);
    return () => cancelAnimationFrame(r);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return; // the button toggles itself
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => place();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onClick={(e) => {
          // inside a <label>, a click would otherwise focus/activate the field
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={`inline-flex items-center justify-center align-middle shrink-0 rounded-full text-slate-400 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 transition-colors ${className}`}
      >
        <Info size={size} />
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              position: 'fixed',
              zIndex: 1000,
              width: Math.min(288, window.innerWidth - 16),
              left: pos?.left ?? 0,
              top: pos?.top ?? 0,
              transform: pos?.above ? 'translateY(-100%)' : undefined,
              visibility: pos ? 'visible' : 'hidden',
            }}
            onClick={() => setOpen(false)}
            className="rounded-xl border border-line bg-surface text-ink-2 shadow-lg px-3 py-2.5 text-xs font-normal leading-relaxed normal-case tracking-normal text-left"
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

/** A small "ⓘ Note" line: the explanation sits behind the icon instead of being printed on the page. */
export function InfoNote({
  children,
  label = 'Note',
  className = '',
}: {
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-slate-500 ${className}`}>
      <InfoTip>{children}</InfoTip>
      <span>{label}</span>
    </span>
  );
}
