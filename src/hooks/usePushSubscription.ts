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
        const regKey = `aurafin-push-reg:${uid}`;
        const stamp = `${sub.endpoint}|${JSON.stringify(json.keys ?? {})}`;
        // Already saved this exact subscription within the last day: nothing to write.
        try {
          const prev = JSON.parse(localStorage.getItem(regKey) ?? 'null');
          if (prev && prev.stamp === stamp && Date.now() - prev.at < 24 * 3600 * 1000) return;
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
