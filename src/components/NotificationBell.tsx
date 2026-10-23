import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Bell, BellOff, BellRing, Trash2 } from 'lucide-react';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { IconButton } from './ui';
import IndexSessionsCard from './IndexSessionsCard';
import { getIstDateInfo } from '../utils/marketHours';
import { useUiStore } from '../store/uiStore';
import { useAlertsStore, LIST_KINDS, type AlertKind } from '../store/alertsStore';
import { showSystemNotification } from '../hooks/useMarketAlerts';

const KIND_STYLE: Record<AlertKind, string> = {
  'pre-open': 'text-amber-600',
  open: 'text-emerald-600',
  close: 'text-slate-600',
  market: 'text-red-500',
  up: 'text-emerald-600',
  down: 'text-red-500',
};

function timeAgo(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
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
  const groups = items.reduce<[string, typeof items][]>((acc, i) => {
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
    setOpen((o) => {
      if (!o) markAllRead();
      return !o;
    });
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
          className="h-full w-full md:w-1/2 bg-page flex flex-col border-l border-line shadow-xl"
        >
          <div className="px-4 h-14 border-b border-line flex items-center justify-between shrink-0 bg-surface">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close notifications"
                className="tap-scale h-9 w-9 -ml-2 flex items-center justify-center rounded-lg text-ink hover:bg-surface-hover"
              >
                <ArrowLeft size={20} />
              </button>
              <p className="text-base font-semibold text-ink">Notifications</p>
            </div>
            <div className="flex items-center gap-2">
              {perm === 'granted' && (
                <button
                  type="button"
                  onClick={() => void showSystemNotification('Aurafin', 'Test notification', 'aurafin-test')}
                  aria-label="Send a test notification"
                  title="Send a test notification"
                  className="h-7 w-7 flex items-center justify-center rounded-full border border-line text-slate-600 hover:bg-surface-hover"
                >
                  <BellRing size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setEnabled(!enabled)}
                className={`h-7 px-3 rounded-full text-xs font-medium border ${
                  enabled ? 'border-emerald-600 text-emerald-700' : 'border-line text-slate-500'
                }`}
              >
                {enabled ? 'On' : 'Off'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const day = getIstDateInfo().dateKey;
                  clear(day);
                  ['nifty', 'sensex', 'banknifty'].forEach((k) => hideCard(`${day}:${k}`));
                }}
                aria-label="Clear all notifications"
                className="h-7 px-2.5 inline-flex items-center gap-1 rounded-full border border-line text-xs font-medium text-slate-600 hover:text-red-500 hover:border-red-300"
              >
                <Trash2 size={13} /> Clear all
              </button>
            </div>
          </div>

          {perm !== 'granted' && perm !== 'unsupported' && (
            <button
              type="button"
              onClick={enablePopups}
              className="w-full flex items-center gap-2 px-4 py-3 text-sm font-medium text-primary-ink bg-primary-soft text-left shrink-0"
            >
              <BellRing size={16} />
              {perm === 'denied'
                ? 'Pop-ups are blocked — allow notifications in your browser settings'
                : 'Turn on pop-up notifications'}
            </button>
          )}

          <div className="flex-1 overflow-y-auto overscroll-contain">
            <IndexSessionsCard hasAlerts={items.length > 0} />
            <div className="pb-6">
            {groups.map(([label, list]) => (
              <div key={label}>
                <p className="px-4 pt-4 pb-2 text-xs font-semibold tracking-wide text-muted uppercase">{label}</p>
                <div className="mx-4 rounded-xl border border-line bg-surface divide-y divide-line-soft overflow-hidden">
                {list.map((i) => (
                  <div key={i.id} className="px-4 py-3 w-full">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-base font-semibold ${KIND_STYLE[i.kind]}`}>{i.title}</p>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-xs text-muted">{timeAgo(i.at)}</span>
                        <button
                          type="button"
                          onClick={() => remove(i.id)}
                          aria-label="Delete notification"
                          className="h-7 w-7 flex items-center justify-center rounded-full text-slate-500 hover:bg-surface-hover hover:text-red-500"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-slate-600 whitespace-pre-line">{i.body}</p>
                  </div>
                ))}
                </div>
              </div>
            ))}
            </div>
          </div>
        </div>
        </div>,
        document.body
      )}
    </div>
  );
}
