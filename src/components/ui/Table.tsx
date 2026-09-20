import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes, ReactNode } from 'react';
import { ArrowUpDown, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from './cn';

/** Horizontal-scroll wrapper — tables never push the page wider than the viewport. */
export function TableContainer({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('w-full overflow-x-auto', className)} {...rest}>
      {children}
    </div>
  );
}

export function Table({ className, children, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <table className={cn('w-full text-sm border-collapse', className)} {...rest}>
      {children}
    </table>
  );
}

export function THead({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={cn('bg-surface-muted border-b border-line', className)} {...rest}>
      {children}
    </thead>
  );
}

export function TBody({ className, children, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody className={className} {...rest}>
      {children}
    </tbody>
  );
}

export interface ThProps extends Omit<ThHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'left' | 'right' | 'center';
  /** Makes the header clickable and shows a sort affordance. */
  sortable?: boolean;
  active?: boolean;
  dir?: 'asc' | 'desc';
  onSort?: () => void;
}

/** Column heading: 12px medium muted; right-aligned for numeric columns. */
export function Th({ align = 'left', sortable, active, dir, onSort, className, children, ...rest }: ThProps) {
  const right = align === 'right';
  const content: ReactNode = sortable ? (
    <button
      type="button"
      onClick={onSort}
      className={cn(
        'inline-flex items-center gap-1 th-label rounded-md hover:text-ink transition-colors',
        right && 'flex-row-reverse',
        active && 'text-ink'
      )}
    >
      {children}
      {active ? (
        dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />
      ) : (
        <ArrowUpDown size={11} className="opacity-40" />
      )}
    </button>
  ) : (
    children
  );
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn(
        'h-10 px-4 first:pl-5 last:pr-5 th-label whitespace-nowrap',
        align === 'left' && 'text-left',
        right && 'text-right',
        align === 'center' && 'text-center',
        className
      )}
      {...rest}
    >
      {content}
    </th>
  );
}

export interface TrProps extends HTMLAttributes<HTMLTableRowElement> {
  /** Pointer cursor + hover fill (default true when onClick is set). */
  interactive?: boolean;
}

export function Tr({ interactive, className, onClick, children, ...rest }: TrProps) {
  const clickable = interactive ?? !!onClick;
  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-line-soft last:border-b-0 transition-colors duration-150 hover:bg-surface-hover/70',
        clickable && 'cursor-pointer',
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export interface TdProps extends Omit<TdHTMLAttributes<HTMLTableCellElement>, 'align'> {
  align?: 'left' | 'right' | 'center';
  /** Tabular figures, no wrapping — for money/percent columns. */
  numeric?: boolean;
}

export function Td({ align, numeric, className, children, ...rest }: TdProps) {
  const a = align ?? (numeric ? 'right' : 'left');
  return (
    <td
      className={cn(
        'px-4 first:pl-5 last:pr-5 py-3 align-middle text-ink',
        a === 'right' && 'text-right',
        a === 'center' && 'text-center',
        numeric && 'font-numeric font-medium whitespace-nowrap',
        className
      )}
      {...rest}
    >
      {children}
    </td>
  );
}
