import { Children, Fragment, isValidElement, type ChangeEvent, type ReactElement, type ReactNode, type Ref, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { inputClasses } from './Input';
import CustomSelect, { type CustomSelectOption } from '../CustomSelect';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
  /** Kept so existing call sites compile; the dropdown is a custom button, not a native <select>. */
  ref?: Ref<HTMLSelectElement>;
}

/** Turns `<option value="x">Label</option>` children (also inside fragments / arrays) into options. */
function optionsFrom(children: ReactNode): CustomSelectOption[] {
  const out: CustomSelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const el = child as ReactElement<{ value?: string | number; disabled?: boolean; children?: ReactNode }>;
    if (el.type === Fragment) { out.push(...optionsFrom(el.props.children)); return; }
    if (el.type !== 'option') return;
    const label = el.props.children;
    out.push({
      value: String(el.props.value ?? (typeof label === 'string' || typeof label === 'number' ? label : '')),
      label,
      disabled: el.props.disabled,
    });
  });
  return out;
}

/** Dropdown that looks the same everywhere (matches Input, with an arrow and the app's own menu).
 *  Same props as a native <select> with <option> children, so call sites didn't change. */
export default function Select({ invalid, className, children, value, disabled, onChange, id }: SelectProps) {
  return (
    <div className="relative w-full">
      <CustomSelect
        id={id}
        value={String(value ?? '')}
        options={optionsFrom(children)}
        disabled={disabled}
        onChange={(v) => onChange?.({ target: { value: v }, currentTarget: { value: v } } as unknown as ChangeEvent<HTMLSelectElement>)}
        className={cn(inputClasses, invalid && 'border-red-400', className)}
      />
    </div>
  );
}
