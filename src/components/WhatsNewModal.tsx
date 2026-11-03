import { useEffect, useState } from 'react';
import { ArrowRight, Check, RefreshCw, X } from 'lucide-react';
import Modal from './Modal';

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
}: {
  open: boolean;
  onClose: () => void;
  notes: WhatsNew | null;
  updating: boolean;
  onUpdate: () => void;
  /** 'checking': looking for an update (spinner). 'uptodate': nothing new, so
   *  the list is empty. 'available': show the release notes + Update button. */
  status?: 'checking' | 'available' | 'uptodate';
}) {
  const available = status === 'available';
  return (
    <Modal open={open} onClose={onClose}
      title={available ? notes?.title ?? "What's new" : "What's new"}
      contentPanel={status === 'uptodate'}
      hideHeader={status === 'uptodate'}
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
          {available && <button
            type="button"
            disabled={updating}
            onClick={onUpdate}
            className="tap-scale inline-flex items-center gap-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
          >
            {updating ? 'Updating…' : 'Update now'}
            {updating ? <RefreshCw size={15} className="animate-spin" /> : <ArrowRight size={16} strokeWidth={2.25} />}
          </button>}
        </div>
      }
    >
      {status === 'checking' && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-muted" role="status" aria-live="polite">
          <RefreshCw size={28} className="animate-spin text-brand-600" />
          <p className="text-sm">Checking for updates…</p>
        </div>
      )}
      {status === 'uptodate' && (
        // Desktop: the working area (sidebar, top bar and index strip stay visible) split in two. The message fills the left
        // half; the right half is the sandal page colour, edge to edge inside the panel.
        // Phones keep the simple stacked message inside the full-screen sheet.
        <div className="relative md:absolute md:inset-0 md:grid md:grid-cols-2">
          <div className="relative flex flex-col items-start justify-center gap-6 py-2 md:px-16 md:py-10">
            <h3 className="hidden md:block absolute top-8 left-16 text-[18px] font-semibold text-ink tracking-tight">What's new</h3>
            <div className="flex flex-col items-start gap-2 md:gap-3">
              <span className="h-11 w-11 md:h-14 md:w-14 rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b] inline-flex items-center justify-center">
                <Check size={22} strokeWidth={2.5} />
              </span>
              <p className="text-sm md:text-2xl font-semibold text-ink mt-1">You're up to date</p>
              <p className="text-[13px] md:text-base text-muted">There's nothing new to show right now.</p>
            </div>
          </div>
          <div className="hidden md:block bg-sandal" aria-hidden />
          {/* Desktop's full-screen view has no footer slot, so pin Close to the
              bottom-left here. On phones the pinned footer carries it. */}
          <button
            type="button"
            onClick={onClose}
            className="tap-scale hidden md:block absolute bottom-8 left-12 px-4 py-2.5 text-sm font-medium text-muted hover:text-ink transition-colors"
          >
            Close
          </button>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="keep-round tap-scale hidden md:flex absolute top-6 right-6 h-10 w-10 items-center justify-center text-slate-600 hover:bg-black/5 dark:hover:bg-white/10 hover:text-ink transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      )}
      {available && (notes?.version || notes?.date) && (
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
      {available && (notes ? (
        <ul className="space-y-3.5">
          {notes.items.map((item) => (
            <li key={item.title} className="flex items-center gap-3">
              {item.emoji ? (
                <span className="shrink-0 h-9 w-9 rounded-xl bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 inline-flex items-center justify-center text-xl leading-none" aria-hidden>
                  {item.emoji}
                </span>
              ) : (
                <span className="mt-0.5 shrink-0 h-5 w-5 rounded-full bg-[#e7f4ec] dark:bg-[#0a9a4b]/15 text-[#0a9a4b] inline-flex items-center justify-center">
                  <Check size={13} strokeWidth={3} />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink leading-snug">{item.title}</p>
                {item.description && <p className="text-[13px] text-muted leading-snug mt-0.5">{item.description}</p>}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          A new version of Aurafin is ready, with improvements and fixes. Update to get it.
        </p>
      ))}
    </Modal>
  );
}
