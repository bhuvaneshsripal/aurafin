import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from './cn';

import { buttonClasses, type ButtonVariant, type ButtonSize } from './buttonStyles';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export default function Button({
  variant = 'primary',
  size = 'md',
  leftIcon,
  rightIcon,
  loading,
  fullWidth,
  className,
  children,
  disabled,
  type = 'button',
  ref,
  ...rest
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(buttonClasses(variant, size), fullWidth && 'w-full', className)}
      {...rest}
    >
      {loading ? <Loader2 size={15} className="animate-spin" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon-only buttons need an accessible name. */
  label: string;
  size?: 'sm' | 'md';
  variant?: 'ghost' | 'secondary';
  ref?: Ref<HTMLButtonElement>;
}

/** Square icon-only button — header actions, row menus, close buttons. */
export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  className,
  children,
  type = 'button',
  ref,
  ...rest
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center shrink-0 transition-colors duration-150',
        size === 'sm' ? 'h-8 w-8' : 'h-9 w-9',
        variant === 'ghost'
          ? 'text-muted hover:bg-surface-hover hover:text-ink'
          : 'bg-surface text-muted border border-line shadow-xs hover:bg-surface-hover hover:text-ink',
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
