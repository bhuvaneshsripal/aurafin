import { useRef, useState } from 'react';
import { Calendar } from 'lucide-react';
import { cn } from './cn';
import { displayToIso, isoToDisplay, maskDateInput } from '../../utils/date';

export interface DateInputProps {
  /** Stored value as "YYYY-MM-DD" (or "" when empty). */
  value: string;
  /** Called with "YYYY-MM-DD", or "" while the typed date is empty,
   *  incomplete, not a real date, or outside min/max. */
  onChange: (value: string) => void;
  /** Inclusive "YYYY-MM-DD" bounds. */
  min?: string;
  max?: string;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  'aria-label'?: string;
}

/**
 * Date field that always reads and writes DD-MM-YYYY, whatever the browser or
 * device locale is (a native <input type="date"> follows the OS locale and
 * can't be forced). Type the date (dashes are added for you) or use the
 * calendar button, which opens the native picker. The value handed to
 * `onChange` is still ISO "YYYY-MM-DD", so storage and date maths are unchanged.
 */
export default function DateInput({
  value,
  onChange,
  min,
  max,
  className,
  disabled,
  required,
  autoFocus,
  id,
  'aria-label': ariaLabel,
}: DateInputProps) {
  const pickerRef = useRef<HTMLInputElement>(null);

  const textToValue = (t: string) => {
    const iso = displayToIso(t);
    if (!iso) return '';
    if ((min && iso < min) || (max && iso > max)) return '';
    return iso;
  };

  const [text, setText] = useState(() => isoToDisplay(value));
  const [prevValue, setPrevValue] = useState(value);
  const [blurred, setBlurred] = useState(false);

  // The parent changed the value from outside (form reset, edit modal opening,
  // ...). Re-sync the text — unless it already represents that value, which is
  // the normal case right after the person typed it.
  if (value !== prevValue) {
    setPrevValue(value);
    if (value !== textToValue(text)) setText(isoToDisplay(value));
  }

  const handleText = (raw: string) => {
    const next = maskDateInput(raw, text);
    setText(next);
    setBlurred(false);
    const nextValue = textToValue(next);
    setPrevValue(nextValue);
    onChange(nextValue);
  };

  const handlePicked = (iso: string) => {
    setText(isoToDisplay(iso));
    setBlurred(false);
    setPrevValue(iso);
    onChange(iso);
  };

  const openPicker = () => {
    const el = pickerRef.current;
    if (!el || disabled) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
      el.click();
    }
  };

  // Margin utilities (e.g. `mt-1`) belong on the wrapper, otherwise they'd push
  // the input down inside it and leave the calendar button misaligned.
  const classTokens = (className ?? '').split(/\s+/).filter(Boolean);
  const wrapperClass = classTokens.filter((t) => /^-?m[trblxy]?-/.test(t));
  const fieldClass = classTokens.filter((t) => !/^-?m[trblxy]?-/.test(t));

  const invalid = text !== '' && textToValue(text) === '' && (blurred || text.length === 10);

  return (
    <div className={cn('relative w-full min-w-0', wrapperClass)}>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="DD-MM-YYYY"
        maxLength={10}
        value={text}
        onChange={(e) => handleText(e.target.value)}
        onBlur={() => setBlurred(true)}
        disabled={disabled}
        required={required}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        style={{ paddingRight: 36 }}
        className={cn(fieldClass, invalid && 'border-red-400 hover:border-red-400')}
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label="Open calendar"
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted hover:text-ink disabled:opacity-50"
      >
        <Calendar size={16} aria-hidden />
      </button>
      {/* Native picker only — never shown. It just supplies the calendar popup. */}
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value}
        min={min}
        max={max}
        disabled={disabled}
        onChange={(e) => handlePicked(e.target.value)}
        className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
      />
    </div>
  );
}
