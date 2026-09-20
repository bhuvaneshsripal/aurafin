/**
 * The Aurafin coin logo. Static — the old auto-spinning coin flip was purely
 * decorative motion, so it's gone. The circular clip lives on this wrapper.
 */
export default function AppLogo({ className }: { className?: string }) {
  return (
    <span className={`inline-block overflow-hidden select-none shrink-0 ${className ?? ''}`}>
      <img src="/logo-icon.png" alt="Aurafin" title="Aurafin" className="block h-full w-full object-cover" />
    </span>
  );
}
