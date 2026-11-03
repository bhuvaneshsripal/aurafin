import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCw, Sparkles, X } from 'lucide-react';
import Modal from './Modal';
import { APP_VERSION } from '../config/version';

export interface WhatsNew {
  version?: string;
  date?: string;
  title?: string;
  items: { emoji?: string; title: string; description?: string }[];
}

/** Fetches the release notes published with the newest deploy (/whats-new.json).
 *  The running (older) app can't know what the new build contains, so it asks
 *  the server — only once `enabled`, i.e. when an update is actually waiting.
 *  Resolves to null if the file is missing or unreadable; the caller then shows
 *  a generic message instead of failing. */
export function useWhatsNew(enabled: boolean): WhatsNew | null {
  const [notes, setNotes] = useState<WhatsNew | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch(`/whats-new.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled || !json || !Array.isArray(json.items) || json.items.length === 0) return;
        setNotes(json as WhatsNew);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return notes;
}

/** "What's new" dialog opened from the update notice, with an Update button. */
export default function WhatsNewModal({
  open,
  onClose,
  notes,
  updating,
  onUpdate,
  status = 'available',
  lastChecked = null,
  onRecheck,
}: {
  open: boolean;
  onClose: () => void;
  notes: WhatsNew | null;
  updating: boolean;
  onUpdate: () => void;
  /** 'checking': looking for an update (spinner). 'uptodate': nothing new, so
   *  the list is empty. 'available': show the release notes + Update button. */
  status?: 'checking' | 'available' | 'uptodate';
  /** When the last check for updates finished (shown on the up-to-date view). */
  lastChecked?: Date | null;
  /** Runs the update check again ("Check again" on the up-to-date view). */
  onRecheck?: () => void;
}) {
  const available = status === 'available';
  const heading = available ? notes?.title ?? "What's new" : "What's new";
  return (
    // Every state fills the working area (sidebar + top bar stay visible), so
    // the update notice, the spinner and the "up to date" view all look alike.
    // On phones this becomes the full-screen sheet with the pinned footer.
    <Modal open={open} onClose={onClose}
      title={heading}
      contentPanel
      flush
      hideHeader
      fullScreenOnMobile
      footer={
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="tap-scale -ml-4 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            {available ? 'Do it later' : 'Close'}
          </button>
          {available && <UpdateButton updating={updating} onUpdate={onUpdate} />}
        </div>
      }
    >
      {status === 'checking' && (
        <div className="relative md:absolute md:inset-0 flex items-center justify-center py-10 md:py-0" role="status" aria-live="polite">
          <DesktopHeading text={heading} />
          <div className="flex flex-col items-center justify-center gap-3 text-muted md:-mt-6">
            <RefreshCw size={28} className="animate-spin text-brand-600" />
            <p className="text-sm">Checking for updates…</p>
          </div>
          <DesktopXClose onClose={onClose} />
        </div>
      )}
      {status === 'uptodate' && (
        // Centered status view. On desktop it fills the working area (sidebar
        // and top bar stay visible); on phones it sits inside the full-screen
        // sheet, whose footer carries Close.
        <div className="relative md:absolute md:inset-0 flex items-center justify-center py-10 md:py-0">
          <DesktopHeading text={heading} />
          <div className="flex flex-col items-center text-center w-full max-w-[420px] md:-mt-6">
            <div className="relative h-20 w-20 md:h-24 md:w-24 mb-6">
              <span
                aria-hidden
                className="absolute -inset-5 rounded-full"
                style={{ background: 'radial-gradient(circle, rgba(10,154,75,0.20), rgba(10,154,75,0) 70%)' }}
              />
              <span className="relative h-full w-full rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b] inline-flex items-center justify-center">
                <svg viewBox="0 0 24 24" className="h-9 w-9 md:h-11 md:w-11" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M5 12.5l4.5 4.5L19 7.5" pathLength={1} style={{ strokeDasharray: 1, strokeDashoffset: 1, animation: 'wn-check 0.6s 0.15s ease-out forwards' }} />
                </svg>
              </span>
            </div>
            <style>{'@keyframes wn-check{to{stroke-dashoffset:0}}'}</style>
            <h3 className="text-xl md:text-[28px] font-semibold text-ink tracking-tight">You're up to date</h3>
            <p className="mt-2 text-sm md:text-base text-muted">You have the latest version of AuraFin.</p>
            <dl className="mt-7 w-full rounded-2xl border border-line bg-surface px-4 text-left text-sm shadow-sm">
              <div className="flex items-center justify-between py-3">
                <dt className="text-muted">Version</dt>
                <dd className="font-semibold text-ink">{APP_VERSION}</dd>
              </div>
              <div className="flex items-center justify-between py-3 border-t border-line-soft">
                <dt className="text-muted">Last checked</dt>
                <dd className="font-semibold text-ink">
                  {lastChecked
                    ? `Today, ${lastChecked.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`
                    : '—'}
                </dd>
              </div>
            </dl>
            {onRecheck && (
              <button
                type="button"
                onClick={onRecheck}
                className="tap-scale mt-5 inline-flex items-center gap-2 rounded-xl border border-[#0a9a4b] px-5 py-2.5 text-sm font-semibold text-[#0a9a4b] hover:bg-[#e7f4ec] dark:hover:bg-[#0a9a4b]/15 transition-colors"
              >
                <RefreshCw size={15} />
                Check again
              </button>
            )}
            <p className="mt-4 text-[12.5px] text-muted">Updates are installed only from Settings.</p>
          </div>
          {/* Desktop's full-screen view has no footer slot, so pin Close to the
              bottom-left here. On phones the pinned footer carries it. */}
          <button
            type="button"
            onClick={onClose}
            className="tap-scale hidden md:block absolute bottom-8 left-10 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Close
          </button>
          <DesktopXClose onClose={onClose} />
        </div>
      )}
      {available && (
        // Update waiting: same full-panel look as "You're up to date". Desktop
        // gets its own title row, a scrolling body and a pinned action bar;
        // phones use the sheet's header/footer and just show the body.
        <div className="relative md:absolute md:inset-0 md:flex md:flex-col">
          <div className="hidden md:flex shrink-0 items-center justify-between pl-14 pr-6 pt-7 pb-3">
            <h3 className="text-[18px] font-semibold text-ink tracking-tight">{heading}</h3>
            <CloseIconButton onClose={onClose} className="flex" />
          </div>
          <div className="md:flex-1 md:min-h-0 md:overflow-y-auto md:overscroll-contain md:px-6 md:py-6">
            <div className="mx-auto w-full md:max-w-[640px]">
              {/* Desktop hero, echoing the check badge on the up-to-date view. */}
              <div className="hidden md:flex flex-col items-center text-center mb-7">
                <div className="relative h-16 w-16 mb-5">
                  <span
                    aria-hidden
                    className="absolute -inset-5 rounded-full"
                    style={{ background: 'radial-gradient(circle, rgba(10,154,75,0.20), rgba(10,154,75,0) 70%)' }}
                  />
                  <span className="relative h-full w-full rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b] inline-flex items-center justify-center">
                    <Sparkles size={28} strokeWidth={2} />
                  </span>
                </div>
                <h3 className="text-[28px] font-semibold text-ink tracking-tight">A new version is ready</h3>
                <p className="mt-2 text-base text-muted">Here's what you'll get when you update.</p>
              </div>
              {(notes?.version || notes?.date) && (
                <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 px-3.5 py-2.5">
                  {notes.version && !(notes.title ?? '').includes(notes.version) && (
                    <span className="rounded-full bg-[#0a9a4b] px-2.5 py-0.5 text-xs font-bold text-white">
                      Version {notes.version}
                    </span>
                  )}
                  {notes.date && (
                    <span className="text-sm font-semibold text-ink">Released {notes.date}</span>
                  )}
                </div>
              )}
              {notes ? (
                <ul className="space-y-3.5 md:space-y-0 md:divide-y md:divide-line-soft md:rounded-2xl md:border md:border-line md:bg-surface md:px-5 md:shadow-sm">
                  {notes.items.map((item) => (
                    <li key={item.title} className="flex items-center gap-3 md:gap-4 md:py-4">
                      {item.emoji ? (
                        <span className="shrink-0 h-9 w-9 md:h-11 md:w-11 rounded-xl bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 inline-flex items-center justify-center text-xl md:text-2xl leading-none" aria-hidden>
                          {item.emoji}
                        </span>
                      ) : (
                        <span className="shrink-0 h-5 w-5 md:h-7 md:w-7 rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b] inline-flex items-center justify-center">
                          <Check size={13} strokeWidth={3} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm md:text-[15px] font-semibold text-ink leading-snug">{item.title}</p>
                        {item.description && <p className="text-[13px] md:text-sm text-muted leading-snug mt-0.5 md:mt-1">{item.description}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm md:text-base text-muted md:text-center">
                  A new version of Aurafin is ready, with improvements and fixes. Update to get it.
                </p>
              )}
            </div>
          </div>
          <div className="hidden md:flex shrink-0 items-center justify-between gap-2 border-t border-line-soft bg-surface px-10 py-5">
            <button
              type="button"
              onClick={onClose}
              className="tap-scale px-4 py-2.5 text-sm font-medium text-muted hover:text-ink transition-colors"
            >
              Do it later
            </button>
            <UpdateButton updating={updating} onUpdate={onUpdate} />
          </div>
        </div>
      )}
    </Modal>
  );
}

function UpdateButton({ updating, onUpdate }: { updating: boolean; onUpdate: () => void }) {
  return (
    <button
      type="button"
      disabled={updating}
      onClick={onUpdate}
      className="tap-scale inline-flex items-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
    >
      {updating ? 'Updating…' : 'Update now'}
      {updating ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={2.25} />}
    </button>
  );
}

/** Round X used by the desktop full-panel views. */
function CloseIconButton({ onClose, className }: { onClose: () => void; className: string }) {
  return (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className={`keep-round tap-scale h-10 w-10 items-center justify-center text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 hover:text-ink transition-colors ${className}`}
    >
      <X size={20} />
    </button>
  );
}

/** Desktop-only title pinned top-left, as on the up-to-date view. */
function DesktopHeading({ text }: { text: string }) {
  return (
    <h3 className="hidden md:block absolute top-8 left-14 text-[18px] font-semibold text-ink tracking-tight">{text}</h3>
  );
}

/** Desktop-only X pinned top-right of the full-panel views. */
function DesktopXClose({ onClose }: { onClose: () => void }) {
  return <CloseIconButton onClose={onClose} className="hidden md:flex absolute top-6 right-6" />;
}
