import { useRef } from 'react';
import type { KeyboardEvent, ClipboardEvent } from 'react';

interface PinBoxInputProps {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
  /** Mask entered digits as dots, like a password field. Defaults to true. */
  mask?: boolean;
}

/** Four (or `length`) individual round digit boxes for entering a PIN,
 *  instead of one long rectangular text field. Handles auto-advance on
 *  type, backspace-to-previous, arrow-key navigation, and paste. */
export default function PinBoxInput({
  value,
  onChange,
  length = 4,
  autoFocus = false,
  mask = true,
}: PinBoxInputProps) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const setDigit = (index: number, digit: string) => {
    const chars = value.split('');
    chars[index] = digit;
    onChange(chars.join('').slice(0, length));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    if (!digit) return;
    setDigit(index, digit);
    if (index < length - 1) refs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value[index]) {
        setDigit(index, '');
      } else if (index > 0) {
        setDigit(index - 1, '');
        refs.current[index - 1]?.focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      refs.current[index - 1]?.focus();
    } else if (e.key === 'ArrowRight' && index < length - 1) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (!pasted) return;
    e.preventDefault();
    onChange(pasted);
    refs.current[Math.min(pasted.length, length - 1)]?.focus();
  };

  return (
    <div className="flex items-center justify-center gap-3">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type={mask ? 'password' : 'text'}
          inputMode="numeric"
          maxLength={1}
          autoFocus={autoFocus && i === 0}
          value={value[i] ?? ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          className="keep-round h-12 w-12 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-center text-lg font-semibold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      ))}
    </div>
  );
}
