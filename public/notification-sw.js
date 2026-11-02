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
    } catch (e) {
      resolve();
    }
  });
}

// Web Push from the server (api/push/send): arrives even when the app is closed.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Aurafin', body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    (async () => {
      // If the app is open and on screen, its own live checks already alert
      // (and the browser lets a visible page skip the pop-up), so don't double up.
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (!data.force && wins.some((c) => c.visibilityState === 'visible')) return;
      // Same alert already showing (e.g. raised by the app a moment ago)? Leave it.
      if (data.tag) {
        const shown = await self.registration.getNotifications({ tag: data.tag });
        if (shown.length) return;
      }
      if (data.tag !== 'aurafin-test') {
        await saveToInbox({ title: data.title || 'Aurafin', body: data.body || '', tag: data.tag || '', at: Date.now() });
        // A hidden-but-open page can pick it up straight away.
        wins.forEach((c) => c.postMessage({ type: 'aurafin-push-stored' }));
      }
      await self.registration.showNotification(data.title || 'Aurafin', {
        body: data.body || '',
        tag: data.tag,
        icon: '/logo-icon.png',
        badge: '/notification-badge.png',
        vibrate: [120, 60, 120],
        data: { url: data.url || '/' },
      });
    })()
  );
});
