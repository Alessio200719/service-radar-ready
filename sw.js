/* ============================================================
 * Service Radar – Service Worker (Web Push)
 * Empfängt Push-Events und zeigt Benachrichtigungen an.
 * Beim Klick wird die Website geöffnet bzw. ein vorhandener Tab fokussiert.
 * ============================================================ */

self.addEventListener('install', function (event) {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  /* Cache-Kill-Switch: entfernt ALLE vom Browser fuer diese Origin gehaltenen
     Cache-Storage-Eintraege. Noetig, weil eine fruehere Service-Worker-Version
     Dateien zwischengespeichert haben kann – Safari lieferte dadurch weiterhin
     eine alte index.html aus. Dieser SW cached selbst nichts (kein fetch-Handler). */
  event.waitUntil(
    caches.keys()
      .then(function (names) { return Promise.all(names.map(function (n) { return caches.delete(n); })); })
      .catch(function () {})
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'Service Radar', body: (event.data && event.data.text && event.data.text()) || '' }; }

  var title = data.title || 'Service Radar';
  var options = {
    body:  data.body || '',
    icon:  data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag:   data.tag || undefined,        // gleiche tag -> ersetzt vorherige Notification
    renotify: !!data.tag,
    data:  { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        var c = list[i];
        // bereits offener Tab -> fokussieren (und ggf. navigieren)
        if ('focus' in c) {
          try { if ('navigate' in c && url && url !== '/') c.navigate(url); } catch (e) {}
          return c.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
