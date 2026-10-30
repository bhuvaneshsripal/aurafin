import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { ChangeEvent } from 'react';

interface PinBoxInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  /** Mask entered digits as dots, like a password field. Defaults to true. */
  mask?: boolean;
  /** Called once, right when the last box is filled in (all `length` digits present). */
  onComplete?: (value: string) => void;
}

/** Lets a parent move focus into this box group imperatively, e.g. to jump
 *  from a "PIN" group straight into a "confirm PIN" group once it's full. */
export interface PinBoxInputHandle {
  focus: () => void;
}

/** Four (or `length`) round digit boxes for entering a PIN.
 *
 *  Underneath there is ONE real <input> that stays focused for the whole
 *  entry; the round boxes are only a display of its value. Earlier each box
 *  was its own input and focus hopped to the next one after every digit —
 *  on phones that made the on-screen keyboard (and the page) flicker on each
 *  keystroke. With a single input the focus never moves, so typing, backspace
 *  and paste are smooth, and the browser's own handling covers them all.
 *  Masking uses CSS (not type="password") so password managers / the
 *  keyboard's autofill bar don't pop up over the PIN. */
function PinBoxInput(
  { value, onChange, length = 4, autoFocus = false, mask = true, onComplete }: PinBoxInputProps,
  ref: React.Ref<PinBoxInputHandle>
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus({ preventScroll: true }),
  }));

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value.replace(/\D/g, '').slice(0, length);
    if (next === value) return;
    onChange(next);
    if (next.length === length && value.length < length) onComplete?.(next);
  };

  const active = Math.min(value.length, length - 1);

  return (
    <div className="relative flex items-center justify-center gap-3">
      {Array.from({ length }).map((_, i) => {
        const digit = value[i];
        const isActive = focused && i === active;
        return (
          <div
            key={i}
            aria-hidden="true"
            className={`keep-round flex h-12 w-12 items-center justify-center border bg-white dark:bg-slate-800 text-lg font-bold text-ink transition-shadow ${
              isActive ? 'border-brand-500 ring-2 ring-brand-500' : 'border-line'
            }`}
          >
            {digit ? (mask ? <span className="h-2 w-2 rounded-full bg-current" /> : digit) : null}
          </div>
        );
      })}
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onFocus={(e) => {
          setFocused(true);
          // Keep the cursor at the end so new digits always append.
          const n = e.target.value.length;
          e.target.setSelectionRange(n, n);
        }}
        onBlur={() => setFocused(false)}
        onClick={(e) => {
          const n = e.currentTarget.value.length;
          e.currentTarget.setSelectionRange(n, n);
        }}
        autoFocus={autoFocus}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={length}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-label={`${length}-digit PIN`}
        data-lpignore="true"
        data-1p-ignore="true"
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        style={{ fontSize: 16, caretColor: 'transparent' }}
      />
    </div>
  );
}

export default forwardRef(PinBoxInput);
