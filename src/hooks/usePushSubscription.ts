import { useEffect, useState } from 'react';
import { deleteDoc, doc, getDocFromServer, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAlertsStore } from '../store/alertsStore';

/** Public VAPID key (set VITE_VAPID_PUBLIC_KEY; see PUSH_SETUP.md). Cleaned the same way the server
 *  cleans it, so a pasted key with quotes, spaces, "=" padding or +/ characters still works. */
const VAPID_PUBLIC_KEY = String((import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '')
  .trim()
  .replace(/^(['"`])([\s\S]*)\1$/, '$2')
  .replace(/\s+/g, '')
  .replace(/=+$/, '')
  .replace(/\+/g, '-')
  .replace(/\//g, '_');

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> | null {
  try {
    const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    // A real VAPID public key is an uncompressed P-256 point: exactly 65 bytes, starting with 0x04.
    // Anything else (the private key pasted by mistake, a truncated key) is rejected by the browser.
    return out.length === 65 && out[0] === 4 ? out : null;
  } catch {
    return null;
  }
}

const VAPID_KEY_BYTES = keyToBytes(VAPID_PUBLIC_KEY);
let warnedBadKey = false;

/** Stable document id for a device: a hash of its push endpoint. */
async function deviceId(endpoint: string): Promise<string> {
  const bytes = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export const pushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  typeof Notification !== 'undefined' &&
  VAPID_PUBLIC_KEY !== '' &&
  VAPID_KEY_BYTES !== null;

/** Why push can't work on this device right now (shown in Settings), or null if it can. */
export function pushBlocker(): string | null {
  if (typeof window === 'undefined') return 'Not available here.';
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/i.test(ua);
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (isIos && !standalone) return 'On iPhone/iPad, first tap Share > "Add to Home Screen", then open Aurafin from the home-screen icon and try again.';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'This browser does not support push notifications.';
  if (VAPID_PUBLIC_KEY === '') return 'The app was built without VITE_VAPID_PUBLIC_KEY. Add it on Vercel and redeploy (see PUSH_SETUP.md).';
  if (VAPID_KEY_BYTES === null) return 'VITE_VAPID_PUBLIC_KEY is not a valid public key (use the Public Key, not the Private Key), then redeploy.';
  if (Notification.permission === 'denied') return 'Notifications are blocked for this site. Open your phone/browser site settings, allow Notifications, then come back.';
  return null;
}

/**
 * Called from a button tap: asks for permission (browsers only allow that from a tap),
 * subscribes this device and saves it so the server can reach it. Returns an error
 * message, or null on success.
 */
export async function enablePushNow(uid: string): Promise<string | null> {
  const blocked = pushBlocker();
  if (blocked) return blocked;
  try {
    // Turn alerts on FIRST. The background registration effect deletes this device's
    // record whenever alerts are off, so doing this after the save could erase it again.
    useAlertsStore.getState().setEnabled(true);
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (perm !== 'granted') return 'Permission was not given. Allow notifications when asked, or enable them in site settings.';
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VAPID_KEY_BYTES! });
    const json = sub.toJSON();
    const ref = doc(db, 'users', uid, 'pushSubscriptions', await deviceId(sub.endpoint));
    await setDoc(
      ref,
      { endpoint: sub.endpoint, keys: json.keys ?? {}, expirationTime: sub.expirationTime ?? null, userAgent: navigator.userAgent.slice(0, 200), updatedAt: Date.now() },
      { merge: true }
    );
    // Make sure the server really has it (not just this phone's offline copy).
    const saved = await getDocFromServer(ref).catch(() => null);
    if (!saved?.exists()) return 'Could not save this phone to the server. Check your internet connection and try again.';
    return null;
  } catch (err) {
    return `Could not register this device: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Forget this device on the server (alerts turned off, or signed out). */
export async function removePushSubscription(uid: string): Promise<void> {
  try {
    if (!pushSupported()) return;
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await deleteDoc(doc(db, 'users', uid, 'pushSubscriptions', await deviceId(sub.endpoint)));
  } catch {
    /* best effort */
  }
}

/**
 * Registers this device for server push, so the market / holding alerts reach
 * it even when Aurafin is closed. The subscription is saved under the signed-in
 * person's account; the server (api/push/send) reads it from there.
 */
export function usePushSubscription() {
  const user = useAuthStore((s) => s.user);
  const enabled = useAlertsStore((s) => s.enabled);
  // Bumped whenever the app returns to the foreground so the device re-checks
  // its registration (browsers can rotate or drop a push subscription).
  const [refreshTick, setRefreshTick] = useState(0);
  const [permission, setPermission] = useState<NotificationPermission>(() =>
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  );

  // The permission prompt is answered elsewhere (useMarketAlerts); notice when it flips.
  useEffect(() => {
    if (typeof Notification === 'undefined') return;
    const sync = () => setPermission(Notification.permission);
    let status: PermissionStatus | undefined;
    navigator.permissions
      ?.query({ name: 'notifications' as PermissionName })
      .then((s) => {
        status = s;
        s.addEventListener('change', sync);
      })
      .catch(() => {});
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      status?.removeEventListener('change', sync);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  useEffect(() => {
    const bump = () => { if (document.visibilityState === 'visible') setRefreshTick((n) => n + 1); };
    document.addEventListener('visibilitychange', bump);
    return () => document.removeEventListener('visibilitychange', bump);
  }, []);

  const uid = user?.uid;
  const guest = (user as { isAnonymous?: boolean } | null)?.isAnonymous === true;

  useEffect(() => {
    if (!uid || guest) return;
    if (VAPID_PUBLIC_KEY !== '' && VAPID_KEY_BYTES === null) {
      // Say it once, plainly, instead of failing on every app-focus.
      if (!warnedBadKey) {
        warnedBadKey = true;
        console.info(
          'Push alerts are off: VITE_VAPID_PUBLIC_KEY is not a valid VAPID public key (it must decode to 65 bytes). ' +
            'Set it to the Public Key from "npx web-push generate-vapid-keys" (not the Private Key), then redeploy. See PUSH_SETUP.md.'
        );
      }
      return;
    }
    if (!pushSupported()) return;
    let cancelled = false;

    if (!enabled) {
      void removePushSubscription(uid);
      return;
    }
    if (permission !== 'granted') return;

    void (async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: VAPID_KEY_BYTES!,
          });
        }
        if (cancelled) return;
        const json = sub.toJSON();
        const regKey = `aurafin-push-reg:${uid}`;
        const stamp = `${sub.endpoint}|${JSON.stringify(json.keys ?? {})}`;
        // Already saved this exact subscription within the last 6 hours: nothing to write.
        try {
          const prev = JSON.parse(localStorage.getItem(regKey) ?? 'null');
          if (prev && prev.stamp === stamp && Date.now() - prev.at < 6 * 3600 * 1000) return;
        } catch { /* ignore */ }
        await setDoc(
          doc(db, 'users', uid, 'pushSubscriptions', await deviceId(sub.endpoint)),
          {
            endpoint: sub.endpoint,
            keys: json.keys ?? {},
            expirationTime: sub.expirationTime ?? null,
            userAgent: navigator.userAgent.slice(0, 200),
            updatedAt: Date.now(),
          },
          { merge: true }
        );
        try { localStorage.setItem(regKey, JSON.stringify({ stamp, at: Date.now() })); } catch { /* ignore */ }
      } catch (err) {
        console.warn('Could not register for push notifications.', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, guest, enabled, permission, refreshTick]);
}

export type PushTestResult = {
  ok: boolean;
  /** What is configured on the server. */
  server?: { vapid: boolean; serviceAccount: boolean; cronSecret: boolean };
  devices: number;
  sent: number;
  error?: string;
};

/** Asks the server to push a test notification to every device signed in to this account. */
export async function sendTestPush(): Promise<PushTestResult> {
  try {
    const { auth } = await import('../firebase/config');
    const token = await auth.currentUser?.getIdToken();
    if (!token) return { ok: false, devices: 0, sent: 0, error: 'Sign in first.' };
    const res = await fetch('/api/push/test', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json().catch(() => ({}));
    return { devices: 0, sent: 0, ...body, ok: !!body.ok, error: body.error };
  } catch (err) {
    return { ok: false, devices: 0, sent: 0, error: err instanceof Error ? err.message : 'Network error' };
  }
}
