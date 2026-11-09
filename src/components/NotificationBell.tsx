import { SHORTCUT_HINT } from '../config/shortcuts';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Activity, ArrowLeft, Bell, BellOff, BellRing, MoreHorizontal, Moon, Sunrise, Trash2, TrendingUp, type LucideIcon } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { IconButton } from './ui';
import { getIstDateInfo } from '../utils/marketHours';
import { useUiStore } from '../store/uiStore';
import { useAlertsStore, LIST_KINDS, type AlertKind } from '../store/alertsStore';
import { toast } from '../store/toastStore';
import { showSystemNotification } from '../hooks/useMarketAlerts';
import { inToast } from '../utils/toastGuard';

const KIND_META: Record<AlertKind, { icon: LucideIcon; tint: string }> = {
  'pre-open': { icon: Sunrise, tint: 'bg-amber-500/15 text-amber-600' },
  open: { icon: TrendingUp, tint: 'bg-emerald-500/15 text-emerald-600' },
  close: { icon: Moon, tint: 'bg-accent-500/15 text-accent-600' },
  market: { icon: Activity, tint: 'bg-red-500/15 text-red-500' },
  up: { icon: TrendingUp, tint: 'bg-emerald-500/15 text-emerald-600' },
  down: { icon: Activity, tint: 'bg-red-500/15 text-red-500' },
};

/** Instagram-style short time: now, 5m, 2h, 3d, then a date. */
function timeAgo(at: number): string {
  const m = Math.floor((Date.now() - at) / 60_000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

const CHIP_RE = /^(.+?)\s+([\d,]+(?:\.\d+)?)\s+\(([+-]?\d+(?:\.\d+)?)%\)$/;

/** "NIFTY 22,936.75 (+1.05%) · SENSEX …" -> one small chip per index; any other text stays plain. */
function AlertBody({ body }: { body: string }) {
  const parts = body.split(' · ').map((p) => CHIP_RE.exec(p.trim()));
  if (parts.length > 0 && parts.every(Boolean)) {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {parts.map((m, i) => {
          const [, name, price, pct] = m!;
          const up = !pct.startsWith('-');
          return (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-surface-muted px-2 py-1 text-xs tabular-nums"
            >
              <span className="font-semibold text-ink">{name}</span>
              <span className="text-ink-2">{price}</span>
              <span className={`font-semibold ${up ? 'text-emerald-600' : 'text-red-500'}`}>
                {up ? '▲' : '▼'} {pct.replace(/^[+-]/, '')}%
              </span>
            </span>
          );
        })}
      </div>
    );
  }
  return <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{body}</p>;
}

/** Swipe timing (ms). Slow and soft on purpose, like Android notifications. */
const SWIPE_FLY_MS = 480; // slide off + fade out after release
const SWIPE_COLLAPSE_MS = 320; // gap closes after the row has faded
const SWIPE_RETURN_MS = 320; // spring back when the swipe was too short

/** Touch: swipe a row left or right to delete it, like Google notifications.
 *  The row follows the finger and fades gradually with distance. Let go far
 *  enough (or flick) and it keeps sliding off while fading out slowly, then
 *  the gap closes smoothly. Let go early and it eases back. Mouse: hover shows
 *  a delete button instead. */
function SwipeRow({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'drag' | 'fly' | 'collapse'>('idle');
  const [height, setHeight] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dxRef = useRef(0);
  const start = useRef<{ x: number; y: number; t: number; active: boolean } | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  const reduce = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const flyMs = reduce ? 0 : SWIPE_FLY_MS;
  const collapseMs = reduce ? 0 : SWIPE_COLLAPSE_MS;

  const move = (v: number) => {
    dxRef.current = v;
    setDx(v);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' || phase === 'fly' || phase === 'collapse') return;
    start.current = { x: e.clientX, y: e.clientY, t: Date.now(), active: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        start.current = null; // it's a vertical scroll
        return;
      }
      if (Math.abs(mx) < 10) return;
      s.active = true;
      setPhase('drag');
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    move(mx);
  };
  const end = (cancelled = false) => {
    const s = start.current;
    start.current = null;
    if (!s?.active) return;
    const el = wrapRef.current;
    const width = el?.offsetWidth || window.innerWidth;
    const d = dxRef.current;
    const speed = Math.abs(d) / Math.max(1, Date.now() - s.t); // px per ms
    const dismiss = !cancelled && (Math.abs(d) > width * 0.35 || (speed > 0.6 && Math.abs(d) > 40));
    if (!dismiss) {
      setPhase('idle');
      move(0);
      return;
    }
    // Keep sliding the way it was going, fading out as it goes.
    setHeight(el?.offsetHeight ?? null);
    setPhase('fly');
    move((d < 0 ? -1 : 1) * width);
    // Once it has faded, close the gap, then remove it.
    timers.current.push(
      window.setTimeout(() => {
        setPhase('collapse');
        setHeight(0);
        timers.current.push(window.setTimeout(onDelete, collapseMs));
      }, flyMs),
    );
  };

  const width = wrapRef.current?.offsetWidth || 360;
  const gone = phase === 'fly' || phase === 'collapse';
  // Fades a little at a time as it moves; fully clear before it reaches the edge.
  const fade = Math.max(0, 1 - Math.abs(dx) / (width * 0.8));

  return (
    <div
      ref={wrapRef}
      className="relative overflow-hidden"
      style={{
        height: height === null ? undefined : height,
        transition: phase === 'collapse' ? `height ${collapseMs}ms cubic-bezier(0.4, 0, 0.2, 1)` : undefined,
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => end()}
        onPointerCancel={() => end(true)}
        style={{
          transform: `translate3d(${dx}px,0,0)`,
          opacity: gone ? 0 : fade,
          transition:
            phase === 'drag'
              ? 'none'
              : gone
                ? `transform ${flyMs}ms cubic-bezier(0.25, 0.1, 0.25, 1), opacity ${flyMs}ms ease-in-out`
                : `transform ${SWIPE_RETURN_MS}ms cubic-bezier(0.22, 1, 0.36, 1), opacity ${SWIPE_RETURN_MS}ms ease-out`,
          willChange: phase === 'drag' ? 'transform, opacity' : undefined,
          touchAction: 'pan-y',
        }}
        className="relative"
      >
        {children}
      </div>
    </div>
  );
}

/** Top-bar bell: market + holding alert history, with a switch to turn alerts
 *  (and phone/desktop pop-up notifications) on or off. */
export default function NotificationBell(_props: { align?: 'right' | 'left' } = {}) {
  const allItems = useAlertsStore((s) => s.items);
  const items = allItems.filter((i) => LIST_KINDS.includes(i.kind));
  const enabled = useAlertsStore((s) => s.enabled);
  const setEnabled = useAlertsStore((s) => s.setEnabled);
  const markAllRead = useAlertsStore((s) => s.markAllRead);
  const clear = useAlertsStore((s) => s.clear);
  const removeRaw = useAlertsStore((s) => s.remove);
  const restore = useAlertsStore((s) => s.restore);
  const unhideCards = useAlertsStore((s) => s.unhideCards);
  /** Delete one alert, with an Undo toast that puts it back. */
  const remove = (id: string) => {
    const gone = useAlertsStore.getState().items.find((i) => i.id === id);
    removeRaw(id);
    if (gone) toast.undo('Notification deleted', () => restore([gone]));
  };
  const hideCard = useAlertsStore((s) => s.hideCard);
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const menuRef = useRef<HTMLDivElement>(null);
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
  );
  const ref = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const dayLabel = (at: number) => {
    const key = new Date(at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const today = getIstDateInfo().dateKey;
    const y = new Date(Date.now() - 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    if (key === today) return 'Today';
    if (key === y) return 'Yesterday';
    return new Date(at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  };
  const isNew = (i: (typeof items)[number]) => newIds.has(i.id) || !i.read;
  const fresh = items.filter(isNew);
  const groups = items.filter((i) => !isNew(i)).reduce<[string, typeof items][]>((acc, i) => {
    const label = dayLabel(i.at);
    const last = acc[acc.length - 1];
    if (last && last[0] === label) last[1].push(i);
    else acc.push([label, [i]]);
    return acc;
  }, []);
  const unread = items.filter((i) => !i.read).length;

  useBodyScrollLock(open);

  // Hide the bottom nav while open, and place the page right under the top
  // bar (and the market-index strip on phones) so those stay visible.
  const setNotificationsOpen = useUiStore((s) => s.setNotificationsOpen);
  const [box, setBox] = useState({ top: 56, left: 0 });
  useEffect(() => {
    setNotificationsOpen(open);
    return () => setNotificationsOpen(false);
  }, [open, setNotificationsOpen]);
  useEffect(() => {
    if (!open) return;
    const measure = () => {
      const bar = document.getElementById('app-topbar')?.getBoundingClientRect();
      const strip = document.getElementById('app-marquee')?.getBoundingClientRect();
      const stripVisible = strip && strip.height > 0 && strip.width > 0;
      setBox({
        top: Math.max(bar?.bottom ?? 56, stripVisible ? strip!.bottom : 0),
        left: bar?.left ?? 0,
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  // Any tap outside the panel (sidebar, top bar, bottom nav, page) closes it;
  // the bell itself is left alone so it can still toggle. A route change
  // closes it too.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (inToast(e.target)) return;
      const t = e.target as Node | null;
      if (!t) return;
      if (panelRef.current?.contains(t) || ref.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (!open) {
      setNewIds(new Set(items.filter((i) => !i.read).map((i) => i.id)));
      markAllRead();
    }
    setMenuOpen(false);
    setOpen(!open);
  };

  // Keyboard shortcut: Alt+N opens / closes the notifications panel. (Ctrl+N
  // can't be used: browsers keep it for "New window" and never pass it to the
  // page.) Ignored while typing in a field or while a dialog is open.
  const toggleRef = useRef(toggle);
  toggleRef.current = toggle;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.shiftKey || !e.altKey) return;
      if (e.code !== 'KeyN') return; // e.code, because Alt changes e.key on some layouts
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      e.preventDefault();
      toggleRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Close the ⋯ menu on any tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (inToast(e.target)) return;
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);

  const clearAll = () => {
    const day = getIstDateInfo().dateKey;
    const before = useAlertsStore.getState().items;
    const cardKeys = ['nifty', 'sensex', 'banknifty'].map((k) => `${day}:${k}`);
    const newlyHidden = cardKeys.filter((k) => !useAlertsStore.getState().hiddenCards.includes(k));
    clear(day);
    cardKeys.forEach((k) => hideCard(k));
    if (before.length) {
      toast.undo(`${before.length} notification${before.length === 1 ? '' : 's'} cleared`, () => {
        restore(before);
        unhideCards(newlyHidden);
      });
    }
    setNewIds(new Set());
    setMenuOpen(false);
  };

  const enablePopups = async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPerm(result);
    if (result === 'granted') setEnabled(true);
  };

  return (
    <div className="relative shrink-0" ref={ref}>
      <IconButton label={`Notifications (${SHORTCUT_HINT.notifications})`} onClick={toggle}>
        <span className="relative inline-flex">
          {enabled ? <Bell size={18} /> : <BellOff size={18} />}
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-2 min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold leading-4 text-center">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </span>
      </IconButton>

      {open && createPortal(
        <div
          className="animate-backdrop-in fixed right-0 bottom-0 z-[25] bg-slate-900/40 flex justify-end"
          style={{ top: box.top, left: box.left }}
          onClick={() => setOpen(false)}
        >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="animate-notif-panel relative h-full w-full md:w-1/2 max-w-[640px] bg-page flex flex-col border-l border-line shadow-xl pb-[calc(80px+env(safe-area-inset-bottom))] md:pb-0"
        >
          <div className="px-3 h-14 border-b border-line flex items-center justify-between shrink-0 bg-surface">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="tap-scale h-9 w-9 flex items-center justify-center rounded-full text-ink hover:bg-surface-hover"
              >
                <ArrowLeft size={20} />
              </button>
              <p className="text-lg font-semibold text-ink">Notifications</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                role="switch"
                aria-checked={enabled}
                aria-label="Market alerts"
                onClick={() => setEnabled(!enabled)}
                className="tap-scale inline-flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-full text-xs font-medium text-ink-2 hover:bg-surface-hover"
              >
                {enabled ? 'Alerts on' : 'Alerts off'}
                <span className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                  <span
                    className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-4' : ''}`}
                  />
                </span>
              </button>
              <div className="relative" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More options"
                  aria-expanded={menuOpen}
                  className="tap-scale h-9 w-9 flex items-center justify-center rounded-full text-ink hover:bg-surface-hover"
                >
                  <MoreHorizontal size={20} />
                </button>
                {menuOpen && (
                  <div className="animate-menu-in absolute right-0 top-10 z-10 w-48 rounded-xl border border-line bg-surface shadow-lg py-1 text-sm">
                    {perm === 'granted' && (
                      <button
                        type="button"
                        onClick={() => {
                          void showSystemNotification('Aurafin', 'Test notification', 'aurafin-test');
                          setMenuOpen(false);
                        }}
                        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-ink hover:bg-surface-hover"
                      >
                        <BellRing size={15} /> Send test alert
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={clearAll}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-red-500 hover:bg-surface-hover"
                    >
                      <Trash2 size={15} /> Clear all
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto overscroll-contain">
            {perm !== 'granted' && perm !== 'unsupported' && (
              <button
                type="button"
                onClick={enablePopups}
                className="tap-scale mx-4 mt-4 w-[calc(100%-2rem)] flex items-center gap-3 rounded-2xl bg-primary-soft px-3.5 py-3 text-left"
              >
                <span className="h-9 w-9 shrink-0 rounded-full bg-surface flex items-center justify-center text-primary-ink">
                  <BellRing size={17} />
                </span>
                <span className="text-sm">
                  <span className="block font-semibold text-primary-ink">
                    {perm === 'denied' ? 'Pop-ups are blocked' : 'Turn on pop-up notifications'}
                  </span>
                  <span className="block text-xs text-muted">
                    {perm === 'denied' ? 'Allow notifications for this site in your browser settings' : 'Get market open / close alerts even when Aurafin is closed'}
                  </span>
                </span>
              </button>
            )}

            {items.length === 0 ? (
              <div className="px-6 py-14 flex flex-col items-center text-center animate-notif-row">
                <span className="h-16 w-16 rounded-full border-2 border-ink/80 flex items-center justify-center text-ink">
                  <Bell size={28} />
                </span>
                <p className="mt-4 text-base font-semibold text-ink">You&apos;re all caught up</p>
                <p className="mt-1 text-sm text-muted max-w-xs">Market open, close and index updates will show up here.</p>
              </div>
            ) : (
              <div className="pb-8">
                {[...(fresh.length ? ([['New', fresh]] as [string, typeof items][]) : []), ...groups].map(([label, list], gi) => (
                  <div key={label}>
                    <h3 className="px-4 pt-5 pb-1.5 text-[15px] font-semibold text-ink">{label}</h3>
                    <div className="border-y border-line-soft divide-y divide-line-soft">
                      {list.map((i, ri) => {
                        const { icon: Icon, tint } = KIND_META[i.kind];
                        const unreadRow = label === 'New';
                        return (
                          <SwipeRow key={i.id} onDelete={() => remove(i.id)}>
                            <div
                              style={{ animationDelay: `${Math.min(gi * 3 + ri, 10) * 35}ms` }}
                              className={`animate-notif-row group relative flex gap-3 px-4 py-3 bg-surface`}
                            >
                              <span className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${tint}`}>
                                <Icon size={20} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-[15px] font-semibold text-ink leading-snug">{i.title}</p>
                                  <span className="flex items-center gap-2 shrink-0 pt-0.5">
                                    <span className="text-xs text-muted">{timeAgo(i.at)}</span>
                                    {unreadRow && <span className="h-2 w-2 rounded-full bg-accent-500" aria-label="New" />}
                                  </span>
                                </div>
                                <AlertBody body={i.body} />
                              </div>
                              <button
                                type="button"
                                onClick={() => remove(i.id)}
                                aria-label="Delete notification"
                                className="hidden md:flex absolute right-3 bottom-2.5 h-7 w-7 items-center justify-center rounded-full text-muted opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-surface-hover hover:text-red-500 transition-opacity"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </SwipeRow>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Soft fade where the list meets the bottom navigation, instead of a hard cut. */}
          <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-[calc(80px+env(safe-area-inset-bottom))] md:bottom-0 h-14" style={{ background: 'linear-gradient(to top, var(--color-page), transparent)' }} />
        </div>
        </div>,
        document.body
      )}
    </div>
  );
}
