import type { Ref, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';
import { inputClasses } from './Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  ref?: Ref<HTMLSelectElement>;
}

/** Native <select> dressed to match Input. (For searchable/custom dropdowns
 *  the app also has CustomSelect, which shares the same visual language.) */
export default function Select({ invalid, className, children, ref, ...rest }: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(inputClasses, 'appearance-none pr-9 cursor-pointer', invalid && 'border-red-400', className)}
        {...rest}
      >
        {children}
      </select>
      <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
