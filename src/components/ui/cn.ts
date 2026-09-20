import clsx, { type ClassValue } from 'clsx';

/** Tiny class-name joiner used by every ui/* component. */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
