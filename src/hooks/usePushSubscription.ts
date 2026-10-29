import { useEffect, useState } from 'react';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuthStore } from '../store/authStore';
import { useAlertsStore } from '../store/alertsStore';

/** Public VAPID key (set VITE_VAPID_PUBLIC_KEY; see PUSH_SETUP.md). */
const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) ?? '';

function keyToBytes(base64Url: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64Url.length % 4)) % 4);
  const raw = atob((base64Url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

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
  VAPID_PUBLIC_KEY !== '';

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

  const uid = user?.uid;
  const guest = (user as { isAnonymous?: boolean } | null)?.isAnonymous === true;

  useEffect(() => {
    if (!uid || guest || !pushSupported()) return;
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
            applicationServerKey: keyToBytes(VAPID_PUBLIC_KEY),
          });
        }
        if (cancelled) return;
        const json = sub.toJSON();
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
      } catch (err) {
        console.warn('Could not register for push notifications.', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid, guest, enabled, permission]);
}
