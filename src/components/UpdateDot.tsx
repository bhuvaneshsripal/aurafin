import { useUpdateStore } from '../store/updateStore';

/** Small red "new version available" dot. Place inside a `relative` parent;
 *  it pins itself to the parent's top-right corner. Renders nothing when the
 *  app is up to date. */
export default function UpdateDot({ className = '' }: { className?: string }) {
  const available = useUpdateStore((s) => s.updateAvailable);
  if (!available) return null;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-slate-900 ${className}`}
    />
  );
}
