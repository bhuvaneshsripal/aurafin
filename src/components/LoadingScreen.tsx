/**
 * Shown whenever the app is waiting on something before it can render real
 * content — resolving the signed-in session on first load, or a lazy-loaded
 * route's code still downloading. Uses the same coin logo as the rest of
 * the app (see AppLogo), just looping continuously via `.logo-loading-spin`
 * instead of the one-shot flip that plays on click/idle elsewhere.
 */
export default function LoadingScreen({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 bg-cream-100 dark:bg-slate-950 ${
        fullScreen ? 'min-h-screen' : 'py-24'
      }`}
    >
      <img src="/logo-icon.png" alt="Aurafin" className="logo-loading-spin h-12 w-12 rounded-xl shadow-sm" />
      <p className="text-sm text-slate-400 dark:text-slate-500">Loading…</p>
    </div>
  );
}
