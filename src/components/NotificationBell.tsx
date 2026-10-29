import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { Activity, ArrowLeft, Bell, BellOff, BellRing, MoreHorizontal, Moon, Sunrise, Trash2, TrendingUp, type LucideIcon } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { IconButton } from './ui';
import IndexSessionsCard from './IndexSessionsCard';
import { getIstDateInfo } from '../utils/marketHours';
import { useUiStore } from '../store/uiStore';
import { useAlertsStore, LIST_KINDS, type AlertKind } from '../store/alertsStore';
import { showSystemNotification } from '../hooks/useMarketAlerts';

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

/** Touch: swipe a row left to delete it (like Instagram). Mouse: hover shows a delete button instead. */
function SwipeRow({ onDelete, children }: { onDelete: () => void; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [gone, setGone] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; active: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    start.current = { x: e.clientX, y: e.clientY, active: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const mx = e.clientX - s.x;
    const my = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(my) > 10 && Math.abs(my) > Math.abs(mx)) {
        start.current = null;
        return;
      }
      if (Math.abs(mx) < 10) return;
      s.active = true;
      setDragging(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    setDx(Math.min(0, mx));
  };
  const end = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s?.active) return;
    if (dx < -96) {
      setGone(true);
      window.setTimeout(onDelete, 200);
    } else {
      setDx(0);
    }
  };

  return (
    <div className={`relative overflow-hidden transition-[opacity,max-height] duration-200 ${gone ? 'opacity-0 max-h-0' : 'max-h-96'}`}>
      <div
        aria-hidden
        className="absolute inset-0 flex items-center justify-end pr-6 bg-red-500 text-white"
        style={{ opacity: Math.min(1, Math.abs(dx) / 60) }}
      >
        <Trash2 size={20} />
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={end}
        onPointerCancel={end}
        style={{
          transform: `translate3d(${gone ? -480 : dx}px,0,0)`,
          transition: dragging ? 'none' : 'transform 200ms cubic-bezier(0.2,0.7,0.2,1)',
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
  const remove = useAlertsStore((s) => s.remove);
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

  // Close the ⋯ menu on any tap outside it.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);

  const clearAll = () => {
    const day = getIstDateInfo().dateKey;
    clear(day);
    ['nifty', 'sensex', 'banknifty'].forEach((k) => hideCard(`${day}:${k}`));
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
      <IconButton label="Notifications" onClick={toggle}>
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
          className="animate-backdrop-in fixed right-0 bottom-[calc(56px+env(safe-area-inset-bottom))] md:bottom-0 z-[25] bg-slate-900/40 flex justify-end"
          style={{ top: box.top, left: box.left }}
          onClick={() => setOpen(false)}
        >
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="animate-notif-panel h-full w-full md:w-1/2 max-w-[640px] bg-page flex flex-col border-l border-line shadow-xl"
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

            <IndexSessionsCard />

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
                              className={`animate-notif-row group relative flex gap-3 px-4 py-3 ${unreadRow ? 'bg-primary-soft' : 'bg-surface'}`}
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
        </div>
        </div>,
        document.body
      )}
    </div>
  );
}
