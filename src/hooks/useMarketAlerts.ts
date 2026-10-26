import { useEffect, useRef } from 'react';
import { useAssetsStore } from '../store/assetsStore';
import { useAuthStore } from '../store/authStore';
import { useAlertsStore, type AlertKind } from '../store/alertsStore';
import { resolveLivePrice, resolvePreviousClose, useLivePricesStore } from '../store/livePricesStore';
import { getIstDateInfo, getIstTimeOfDay, isMarketOpen } from '../utils/marketHours';
import { formatCurrency } from '../utils/currency';

/** Price-move levels (%) that trigger a holding alert, in either direction. */
const LEVELS = [2, 5];
const INDEX_LEVELS = [2, 5];
const CHECK_MS = 5_000;

// Session windows in minutes since midnight IST. Each alert fires once a day
// if the app is running anywhere inside its window.
const PRE_OPEN = [9 * 60, 9 * 60 + 15];
const OPEN = [9 * 60 + 15, 9 * 60 + 45];
const CLOSE = [15 * 60 + 30, 17 * 60];

const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export interface IndexQuote {
  key: string;
  name: string;
  price: number;
  previousClose?: number;
  /** Today's opening level, when the data source provides it. */
  open?: number;
}

export async function loadIndices(): Promise<IndexQuote[]> {
  try {
    const res = await fetch(`/api/market/indices?_=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json?.indices) ? json.indices : [];
  } catch {
    return [];
  }
}

function indexLine(indices: IndexQuote[], withChange: boolean): string {
  return indices
    .filter((i) => i.key === 'nifty' || i.key === 'sensex' || i.key === 'banknifty')
    .map((i) => {
      let s = `${i.name} ${fmt(i.price)}`;
      if (withChange && i.previousClose) {
        const pct = ((i.price - i.previousClose) / i.previousClose) * 100;
        s += ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      }
      return s;
    })
    .join(' · ');
}

/** Shows a real phone / desktop notification (status bar + sound) through the
 *  service worker, which is what Android requires. Returns false if the
 *  permission isn't granted. */
// Looked up once and reused, so each pop-up isn't delayed by a fresh lookup.
let regPromise: Promise<ServiceWorkerRegistration | undefined> | undefined;

export async function showSystemNotification(title: string, body: string, tag: string): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false;
  const options: NotificationOptions & { vibrate?: number[]; renotify?: boolean } = {
    body,
    tag,
    icon: '/logo-icon.png',
    badge: '/notification-badge.png',
    vibrate: [120, 60, 120],
    renotify: true,
  };
  try {
    regPromise ??= navigator.serviceWorker?.getRegistration() ?? Promise.resolve(undefined);
    const reg = await regPromise;
    if (reg) {
      await reg.showNotification(title, options);
      return true;
    }
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

interface Part {
  title: string;
  body: string;
}

let pushChain: Promise<unknown> = Promise.resolve();
/** Sends each part as a separate notification, in order, ~0.25s apart. */
function queuePush(parts: Part[], baseTag: string) {
  parts.forEach((p, n) => {
    pushChain = pushChain
      .then(() => showSystemNotification(p.title, p.body, `${baseTag}:${n}`))
      .then(() => new Promise((r) => setTimeout(r, 250)));
  });
}

/** Stock/index move: one notification with the move and current price. */
function movePair(name: string, arrow: string, pct: number, now: string, _prev?: string): Part[] {
  return [{ title: `${name} ${arrow} ${Math.abs(pct).toFixed(2)}%`, body: `Now ${now}` }];
}

/**
 * Market + holding alerts while Aurafin is open (or running in the background
 * as an installed app):
 *  - pre-open (9:00 IST), market open (9:15) and market close (3:30 PM) with
 *    Nifty / Sensex / Bank Nifty levels and the portfolio's day move
 *  - any direct holding up or down 2%, 3% or 5% vs yesterday's close
 * Each alert fires once per trading day.
 */
export function useMarketAlerts() {
  const user = useAuthStore((s) => s.user);
  const enabled = useAlertsStore((s) => s.enabled);
  const busy = useRef(false);

  // Browsers only allow the permission prompt from a tap/click, so ask on the
  // person's first interaction (once) instead of hiding it inside the bell.
  useEffect(() => {
    if (!user || !enabled || typeof Notification === 'undefined' || Notification.permission !== 'default') return;
    const ask = () => {
      document.removeEventListener('pointerup', ask);
      void Notification.requestPermission();
    };
    document.addEventListener('pointerup', ask, { once: true });
    return () => document.removeEventListener('pointerup', ask);
  }, [user, enabled]);

  useEffect(() => {
    if (!user || !enabled) return;

    const raise = (
      dayKey: string,
      key: string,
      kind: AlertKind,
      title: string,
      body: string,
      inList = true,
      parts?: Part[]
    ) => {
      const store = useAlertsStore.getState();
      const fullKey = `${dayKey}:${key}`;
      if (store.fired[fullKey]) return;
      store.markFired(fullKey, dayKey);
      if (inList) store.add({ kind, title, body });
      // Each part is its own phone notification, sent one after another.
      queuePush(parts && parts.length ? parts : [{ title, body }], fullKey);
    };

    const checkMoves = (dayKey: string) => {
      const { prices, previousCloses } = useLivePricesStore.getState();
      for (const a of useAssetsStore.getState().assets) {
        if (!a.symbol || !a.quantity || a.quantity <= 0) continue;
        const price = resolveLivePrice(a.symbol, prices);
        const prev = resolvePreviousClose(a.symbol, previousCloses);
        if (price === undefined || !prev) continue;
        const pct = ((price - prev) / prev) * 100;
        const dir = pct >= 0 ? 'up' : 'down';
        const crossed = LEVELS.filter((l) => Math.abs(pct) >= l);
        if (crossed.length === 0) continue;
        const top = crossed[crossed.length - 1];
        const sym = a.symbol.toUpperCase();
        // Mark lower levels as done too, so a jump straight to +5% gives one alert, not three.
        const store = useAlertsStore.getState();
        for (const l of crossed.slice(0, -1)) {
          if (!store.fired[`${dayKey}:${sym}:${dir}${l}`]) store.markFired(`${dayKey}:${sym}:${dir}${l}`, dayKey);
        }
        raise(
          dayKey,
          `${sym}:${dir}${top}`,
          dir,
          `${a.name} ${dir === 'up' ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`,
          `${dir === 'up' ? 'Up' : 'Down'} ${top}%+ today · now ${formatCurrency(price, a.currency)} (prev close ${formatCurrency(prev, a.currency)})`,
          false, // pop-up only — not listed in the bell
          movePair(
            a.name,
            dir === 'up' ? '▲' : '▼',
            pct,
            formatCurrency(price, a.currency),
            formatCurrency(prev, a.currency)
          )
        );
      }
    };

    // Big index moves (Nifty / Sensex / Bank Nifty) of 2% and 5% vs the previous close.
    const checkMarketMoves = async (dayKey: string, indices: IndexQuote[]) => {
      for (const i of indices) {
        if (!['nifty', 'sensex', 'banknifty'].includes(i.key) || !i.previousClose) continue;
        const pct = ((i.price - i.previousClose) / i.previousClose) * 100;
        const dir = pct >= 0 ? 'up' : 'down';
        const crossed = INDEX_LEVELS.filter((l) => Math.abs(pct) >= l);
        if (!crossed.length) continue;
        const top = crossed[crossed.length - 1];
        const store = useAlertsStore.getState();
        for (const l of crossed.slice(0, -1)) {
          if (!store.fired[`${dayKey}:${i.key}:${dir}${l}`]) store.markFired(`${dayKey}:${i.key}:${dir}${l}`, dayKey);
        }
        raise(
          dayKey,
          `${i.key}:${dir}${top}`,
          'market',
          `${i.name} ${dir === 'up' ? '▲' : '▼'} ${Math.abs(pct).toFixed(2)}%`,
          `Big move: ${i.name} at ${fmt(i.price)} (prev close ${fmt(i.previousClose)})`,
          true,
          movePair(i.name, dir === 'up' ? '▲' : '▼', pct, fmt(i.price), fmt(i.previousClose))
        );
      }
    };

    const check = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        // One index fetch per check, shared by every step below.
        let idxPromise: Promise<IndexQuote[]> | undefined;
        const getIndices = () => (idxPromise ??= loadIndices());
        const { dateKey, isoWeekday } = getIstDateInfo();
        const { hour, minute } = getIstTimeOfDay();
        const mins = hour * 60 + minute;
        // No session on weekends (exchange holidays also keep prices flat,
        // so move alerts naturally stay quiet).
        if (isoWeekday > 5) return;
        const inWin = (w: number[]) => mins >= w[0] && mins < w[1];

        if (inWin(PRE_OPEN) || inWin(OPEN) || inWin(CLOSE)) {
          const fired = useAlertsStore.getState().fired;
          const which = inWin(PRE_OPEN) ? 'pre' : inWin(OPEN) ? 'open' : 'close';
          if (!fired[`${dateKey}:${which}`]) {
            const indices = await getIndices();
            if (indices.length) {
              const idx = indices.filter((i) => ['nifty', 'sensex', 'banknifty'].includes(i.key));
              const verb = which === 'pre' ? 'Pre-market' : which === 'open' ? 'Opened' : 'Closed';
              // One notification per index, then the portfolio — never combined.
              const parts: Part[] = idx.map((i) => {
                const pct = i.previousClose ? ((i.price - i.previousClose) / i.previousClose) * 100 : undefined;
                return {
                  title: `${i.name} ${verb}`,
                  body: `${fmt(i.price)}${pct !== undefined ? ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)` : ''}`,
                };
              });
              useAlertsStore.getState().setSession(
                dateKey,
                which,
                Object.fromEntries(idx.map((i) => [i.key, { price: i.price, prev: i.previousClose }]))
              );
              const title = which === 'pre' ? 'Pre-market started' : which === 'open' ? 'Market opened' : 'Market closed';
              const body = indexLine(indices, true);
              raise(dateKey, which, which === 'pre' ? 'pre-open' : which, title, body, true, parts);
            }
          }
        }

        // Opened the app after the 9:15 window? Send today's index levels once
        // as a catch-up update, one notification per index (+ prev close).
        const missedOpen = mins >= OPEN[1] && mins < CLOSE[1];
        if (missedOpen && !useAlertsStore.getState().fired[`${dateKey}:catchup`] && !useAlertsStore.getState().fired[`${dateKey}:open`]) {
          const indices = (await getIndices()).filter((i) => ['nifty', 'sensex', 'banknifty'].includes(i.key));
          if (indices.length) {
            const parts: Part[] = indices.map((i) => {
              const pct = i.previousClose ? ((i.price - i.previousClose) / i.previousClose) * 100 : undefined;
              return {
                title: `${i.name} ${pct !== undefined ? (pct >= 0 ? '▲' : '▼') : ''} ${pct !== undefined ? Math.abs(pct).toFixed(2) + '%' : ''}`.trim(),
                body: `Now ${fmt(i.price)}`,
              };
            });
            // Back-fill today's open (and close, if the day is over) so the
            // "Today's market" card isn't blank when the app was closed then.
            const store = useAlertsStore.getState();
            const snap = (pick: (i: IndexQuote) => number | undefined) =>
              Object.fromEntries(
                indices.flatMap((i) => {
                  const price = pick(i);
                  return price === undefined ? [] : [[i.key, { price, prev: i.previousClose }]];
                })
              );
            if (!store.sessions[dateKey]?.open) store.setSession(dateKey, 'open', snap((i) => i.open));
            if (mins >= CLOSE[0] && !store.sessions[dateKey]?.close) store.setSession(dateKey, 'close', snap((i) => i.price));
            raise(dateKey, 'catchup', 'market', 'Market update', indexLine(indices, true), true, parts);
          }
        }

        if (isMarketOpen()) {
          checkMoves(dateKey);
          await checkMarketMoves(dateKey, await getIndices());
        }
      } finally {
        busy.current = false;
      }
    };

    void check();
    const id = window.setInterval(check, CHECK_MS);
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, enabled]);
}
