// Loaded into the PWA service worker (see vite.config.ts → workbox.importScripts).
// Tapping a notification opens / focuses Aurafin.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// Every push the worker shows is also saved to a small IndexedDB inbox, so the
// app can add it to its Notifications list the next time it opens (a closed app
// can't be written to directly). utils/pushInbox.ts reads and clears this.
const INBOX_DB = 'aurafin-inbox';
const INBOX_STORE = 'pushes';
function saveToInbox(item) {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open(INBOX_DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(INBOX_STORE, { autoIncrement: true });
      open.onerror = () => resolve();
      open.onsuccess = () => {
        const tx = open.result.transaction(INBOX_STORE, 'readwrite');
        tx.objectStore(INBOX_STORE).add(item);
        tx.oncomplete = () => { open.result.close(); resolve(); };
        tx.onerror = () => resolve();
      };
    } catch {
      resolve();
    }
  });
}

// Web Push from the server (api/push/send): arrives even when the app is closed.
//
// RULE: every push MUST end in a showNotification() call. Chrome (and Safari on iPhone/iPad
// much more strictly) treat a push that shows nothing as abuse and, after a few, silently drop
// the subscription, which is exactly "notifications stop coming once the app is closed". The
// old code returned without showing anything whenever the app was on screen or the same tag
// was already showing, so those pushes counted against the subscription.
const QUIET_TAG = 'aurafin-quiet';

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: 'Aurafin', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      const title = data.title || 'Aurafin';
      const options = {
        body: data.body || '',
        tag: data.tag || undefined,
        icon: '/logo-icon.png',
        badge: '/notification-badge.png',
        vibrate: [120, 60, 120],
        data: { url: data.url || '/' },
      };

      let wins = [];
      try {
        wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      } catch { /* treat as closed */ }
      // App open and on screen: its own live checks already alert, so don't double up.
      const visible = !data.force && wins.some((c) => c.visibilityState === 'visible');
      // Same alert already showing (e.g. raised by the app a moment ago)?
      let duplicate = false;
      if (data.tag) {
        try { duplicate = (await self.registration.getNotifications({ tag: data.tag })).length > 0; } catch { /* ignore */ }
      }

      if (duplicate) {
        // Re-showing the same tag replaces it in place without a new sound; the browser still sees a notification.
        await self.registration.showNotification(title, { ...options, silent: true });
        return;
      }
      if (visible) {
        // Satisfy the "must show something" rule, then take it away again straight away.
        await self.registration.showNotification(title, { ...options, tag: QUIET_TAG, silent: true, vibrate: undefined });
        await new Promise((r) => setTimeout(r, 700));
        try { (await self.registration.getNotifications({ tag: QUIET_TAG })).forEach((n) => n.close()); } catch { /* ignore */ }
        wins.forEach((c) => c.postMessage({ type: 'aurafin-push-stored' }));
        if (data.tag !== 'aurafin-test') await withTimeout(saveToInbox({ title, body: data.body || '', tag: data.tag || '', at: Date.now() }), 2000);
        wins.forEach((c) => c.postMessage({ type: 'aurafin-push-stored' }));
        return;
      }

      // Normal case (app closed / in background): show it FIRST so a slow or failing
      // IndexedDB can never hold the notification back, then file a copy in the inbox.
      await self.registration.showNotification(title, options);
      if (data.tag !== 'aurafin-test') {
        await withTimeout(saveToInbox({ title, body: data.body || '', tag: data.tag || '', at: Date.now() }), 2000);
        wins.forEach((c) => c.postMessage({ type: 'aurafin-push-stored' }));
      }
    })()
  );
});

// The browser can rotate or drop a push subscription on its own while the app is closed. The
// server would then keep pushing to a dead address and nothing arrives until the app is opened.
// Re-subscribe here and tell the server (api/push/test?resubscribe=1) to swap the old address for the new one.
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const oldSub = event.oldSubscription || null;
        let sub = event.newSubscription || null;
        if (!sub) {
          const key = oldSub && oldSub.options && oldSub.options.applicationServerKey;
          if (!key) return; // can't resubscribe without the key; the app will do it when opened
          sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        }
        await fetch('/api/push/test?resubscribe=1', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldEndpoint: oldSub ? oldSub.endpoint : null, subscription: sub.toJSON() }),
        });
      } catch { /* the app re-registers itself the next time it opens */ }
    })()
  );
});
